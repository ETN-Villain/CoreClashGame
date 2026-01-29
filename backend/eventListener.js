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
import { readOwnerCache, writeOwnerCache, deleteCache } from "./utils/ownerCache.js";
import { reconcileAllGames } from "./reconcile.js";
import { fetchOwnedTokenIds } from "./utils/nftUtils.js";
import { loadGames, saveGames } from "./store/gamesStore.js";

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

async function safeGetOnChainGame(gamesLength, maxGameId) {
  if (gamesLength > maxGameId) return null;

  try {
    return await gameContract.games(gamesLength);
  } catch {
    return null;
  }
}

async function handleGameCreated(id) {
  const games = loadGames();
  if (games.find(g => g.id === id)) return; // already exists

  const onChain = await gameContract.games(id);
  games.push({
    id,
    player1: onChain.player1,
    player2: onChain.player2,
    stakeAmount: onChain.stakeAmount.toString(),
    stakeToken: onChain.stakeToken,
    settled: onChain.settled,
    winner: ethers.ZeroAddress,
    cancelled: false,
  });

  saveGames(games);
  console.log(`[EVENT] GameCreated #${id} added to games.json`);
}

/**
 * Auto-update owner cache for a wallet
 */
async function updateWalletCache(wallet) {
  wallet = wallet.toLowerCase();
  console.log(`[AUTO-CACHE] Updating NFT cache for ${wallet}…`);

  try {
const [vkinResult, vqleResult] = await Promise.allSettled([
  fetchOwnedTokenIds(vkinContract, wallet, "VKIN"),
  fetchOwnedTokenIds(vqleContract, wallet, "VQLE")
]);

const vkinIds = vkinResult.status === "fulfilled" ? vkinResult.value : [];
const vqleIds = vqleResult.status === "fulfilled" ? vqleResult.value : [];

    const cache = readOwnerCache();
    cache[wallet] = { VKIN: vkinIds, VQLE: vqleIds };
    writeOwnerCache(cache);

    console.log(`[AUTO-CACHE] Cache updated: ${vkinIds.length} VKIN, ${vqleIds.length} VQLE for ${wallet}`);
  } catch (err) {
    console.error(`[AUTO-CACHE] Failed to update cache for ${wallet}:`, err.message);
  }
}

// POLLING LOOP
setInterval(async () => {
  try {
    // 🔐 STEP 0: determine authoritative max game ID
    let maxGameId;
    try {
      const nextId = await gameContract.gamesLength();
      maxGameId = Number(nextId) - 1;
    } catch (err) {
      console.error("❌ Failed to fetch maxGameId:", err.message);
      return;
    }

    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentBlock);
      console.log(`🔍 Fetching logs ${fromBlock} → ${toBlock}`);

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

        // 🚫 HARD GUARD
        if (gameId > maxGameId) {
          console.warn(`[SKIP] gameId ${gameId} > maxGameId ${maxGameId}`);
          continue;
        }

        const games = loadGames();
        const game = games.find(g => g.id === gameId);
        if (!game) continue;

        const onChain = await safeGetOnChainGame(gameId, maxGameId);
        if (!onChain) continue;

        if (onChain.settled && !game.settled) {
          console.log(`[RECONCILE] Settling game ${gameId}`);

          let backendWinner = ethers.ZeroAddress;
          try {
            backendWinner = await gameContract.backendWinner(gameId);
          } catch {}

          game.settled = true;
          game.settledAt = new Date().toISOString();

          if (backendWinner !== ethers.ZeroAddress) {
            game.cancelled = false;
            game.winner = backendWinner.toLowerCase();
          } else {
            game.cancelled = true;
            game.winner = null;
          }

          saveGames(games);
        }
      }

      lastBlock = toBlock;
      saveLastBlock(lastBlock);
      fromBlock = toBlock + 1;

      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("❌ Event poll error:", err.message);
  }
}, POLL_INTERVAL_MS);
