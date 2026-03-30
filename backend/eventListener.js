import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import VKINABI from "../src/abis/VKINABI.json" assert { type: "json" };
import VQLEABI from "../src/abis/VQLEABI.json" assert { type: "json" };
import {
  GAME_ADDRESS,
  RPC_URL,
  VKIN_CONTRACT_ADDRESS,
  VQLE_CONTRACT_ADDRESS,
} from "./config.js";
import { loadLastBlock, saveLastBlock } from "./utils/blockState.js";
import { readOwnerCache, writeOwnerCache } from "./utils/ownerCache.js";
import { reconcileActiveGamesScheduled } from "./reconcile.js";
import { fetchOwnedTokenIds } from "./utils/nftUtils.js";
import { readGames, writeGames } from "./store/gamesStore.js";
import { readBurnTotal, writeBurnTotal } from "./store/burnStore.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
const vkinContract = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKINABI, provider);
const vqleContract = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLEABI, provider);

const POLL_INTERVAL_MS = 6000;
const MAX_BLOCK_RANGE = 500; // safe range for RPC
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const gameInterface = new ethers.Interface(GameABI);
const GAME_CREATED_TOPIC = gameInterface.getEvent("GameCreated").topic;
const GAME_JOINED_TOPIC = gameInterface.getEvent("GameJoined").topic;
const GAME_SETTLED_TOPIC = gameInterface.getEvent("GameSettled").topic;

console.log("📡 CoreClash event indexer starting…");

let lastBlock = loadLastBlock() ?? ((await provider.getBlockNumber()) - 500);
console.log("▶ Starting from block", lastBlock);

async function handleGameCreated(id) {
  const games = readGames();
  if (games.find(g => g.id === id)) return; // already exists

  const onChain = await gameContract.games(id);
  games.push({
    id,
    player1: onChain.player1,
    player2: onChain.player2,
    stakeAmount: onChain.stakeAmount.toString(),
    stakeToken: onChain.stakeToken,
    settled: onChain.settled,
    winner: ethers.ZeroAddress.toLowerCase(),
    cancelled: false,
  });

  writeGames(games);
  console.log(`[EVENT] GameCreated #${id} added to games.json`);
}

/**
 * Auto-update owner cache for a wallet
 */
async function updateMultipleWalletCaches(wallets) {
  const uniqueWallets = [
    ...new Set(wallets.filter(Boolean).map(w => w.toLowerCase()))
  ];

  if (uniqueWallets.length === 0) return;

  console.log(
    `[AUTO-CACHE] Updating ${uniqueWallets.length} wallet cache(s): ${uniqueWallets.join(", ")}`
  );

  const cache = readOwnerCache();

  for (const wallet of uniqueWallets) {
    try {
      const [vkinResult, vqleResult] = await Promise.allSettled([
        fetchOwnedTokenIds(vkinContract, wallet, "VKIN"),
        fetchOwnedTokenIds(vqleContract, wallet, "VQLE")
      ]);

      const existing = cache[wallet] || { VKIN: [], VQLE: [] };

      const nextVKIN =
        vkinResult.status === "fulfilled" ? vkinResult.value : existing.VKIN;

      const nextVQLE =
        vqleResult.status === "fulfilled" ? vqleResult.value : existing.VQLE;

      if (vkinResult.status === "rejected") {
        console.error(`[AUTO-CACHE] VKIN fetch failed for ${wallet}:`, vkinResult.reason);
      }

      if (vqleResult.status === "rejected") {
        console.error(`[AUTO-CACHE] VQLE fetch failed for ${wallet}:`, vqleResult.reason);
      }

      cache[wallet] = {
        VKIN: nextVKIN,
        VQLE: nextVQLE
      };

      console.log(
        `[AUTO-CACHE] Prepared ${wallet}: ${nextVKIN.length} VKIN, ${nextVQLE.length} VQLE`
      );
    } catch (err) {
      console.error(`[AUTO-CACHE] Failed preparing cache for ${wallet}:`, err.message);
    }
  }

  writeOwnerCache(cache);
  console.log(`[AUTO-CACHE] Batch cache write complete`);
}

// ── POLLING LOOP ──
let isCatchingUp = true; // startup flag
setInterval(async () => {
  try {
    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentBlock);
      console.log(`🔍 Fetching logs ${fromBlock} → ${toBlock}`);

      // ----- GameCreated events -----
      const createdLogs = await provider.getLogs({
        address: GAME_ADDRESS,
        topics: [GAME_CREATED_TOPIC],
        fromBlock,
        toBlock,
      });

      if (createdLogs.length > 0) {
        console.log(`🆕 ${createdLogs.length} GameCreated event(s)`);
        await reconcileActiveGamesScheduled(); // authoritative sync
      }

      for (const log of createdLogs) {
        const parsed = gameInterface.parseLog(log);
      await handleGameCreated(Number(parsed.args.gameId));
      }

      // ----- GameJoined events -----
      const joinedLogs = await provider.getLogs({
        address: GAME_ADDRESS,
        topics: [GAME_JOINED_TOPIC],
        fromBlock,
        toBlock,
      });

      if (joinedLogs.length > 0) {
        console.log(`🆕 ${joinedLogs.length} GameJoined event(s)`);
        await reconcileActiveGamesScheduled();
      }
      
// ----- GameSettled events -----
const settledLogs = await provider.getLogs({
  address: GAME_ADDRESS,
  topics: [GAME_SETTLED_TOPIC],
  fromBlock,
  toBlock,
});

for (const log of settledLogs) {
  const parsed = gameInterface.parseLog(log);
  const gameId = Number(parsed.args.gameId);

  console.log(`🔥 GameSettled #${gameId}`);

  const onChain = await gameContract.games(gameId);

  if (!onChain.settled || onChain.stakeAmount == 0n) continue;

  const games = readGames();
  const game = games.find(g => g.id === gameId);
  if (!game) continue;

  // 🛑 Prevent double counting
  if (game.burnRecorded) continue;

  const stake = onChain.stakeAmount;
  const pot = stake * 2n;
  const burn = pot / 100n; // 1%

  // 🔥 Update running total
// Only add burn if game is not cancelled
if (!game.cancelled) {
  let totalBurn = readBurnTotal();
  totalBurn += burn;
  writeBurnTotal(totalBurn);

  console.log(
    `🔥 Burn added: ${ethers.formatEther(burn)} CORE | Total: ${ethers.formatEther(totalBurn)}`
  );
} else {
  console.log(`Game ${game.id} cancelled — skipping burn update`);
}

// Mark game as processed regardless
game.settled = true;
game.burnRecorded = true;
game.burnWei = burn.toString();
writeGames(games);

  console.log(
    `🔥 Burn added: ${ethers.formatEther(burn)} CORE | Total: ${ethers.formatEther(totalBurn)}`
  );
}

      // ----- NFT transfer logs (VKIN & VQLE) -----
      const getTransferLogs = async (address) =>
        provider.getLogs({ address, topics: [TRANSFER_TOPIC], fromBlock, toBlock });

      const zero = ethers.ZeroAddress.toLowerCase();
      const vkinLogs = await getTransferLogs(VKIN_CONTRACT_ADDRESS);
      const vqleLogs = await getTransferLogs(VQLE_CONTRACT_ADDRESS);

const processLogs = async (logs, contractName, contractInstance) => {
  const affectedWallets = new Set();
  const zero = ethers.ZeroAddress.toLowerCase();

  for (const log of logs) {
    try {
      const parsed = contractInstance.interface.parseLog(log);
      const from = parsed.args.from ? String(parsed.args.from).toLowerCase() : null;
      const to = parsed.args.to ? String(parsed.args.to).toLowerCase() : null;
      const tokenId = parsed.args.tokenId ? parsed.args.tokenId.toString() : "unknown";

      console.log(
        `📦 ${contractName.toUpperCase()} Transfer detected: ${from} -> ${to}, token ${tokenId}`
      );

      if (from && from !== zero) {
        affectedWallets.add(from);
      }

      if (to && to !== zero) {
        affectedWallets.add(to);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to parse ${contractName.toUpperCase()} log:`, err);
    }
  }

  if (affectedWallets.size > 0) {
    const walletList = [...affectedWallets];
    console.log(
      `♻️ ${contractName.toUpperCase()} refreshing ${walletList.length} wallet(s): ${walletList.join(", ")}`
    );
    await updateMultipleWalletCaches(walletList);
  }
};

      await processLogs(vkinLogs, "vkin", vkinContract);
      await processLogs(vqleLogs, "vqle", vqleContract);

      lastBlock = toBlock;
      saveLastBlock(lastBlock);
      fromBlock = toBlock + 1;

  if (toBlock === currentBlock) {
  isCatchingUp = false;
  console.log("✅ Event indexer caught up to latest block");
}

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("❌ Event poll error:", err.message);
  }

}, POLL_INTERVAL_MS);

export { isCatchingUp };