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

// ── POLLING LOOP ──
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
        await reconcileAllGames(); // authoritative sync
      }

      for (const log of createdLogs) {
        const parsed = gameInterface.parseLog(log);
        await handleGameCreated(parsed.args.gameId);
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
        await reconcileAllGames();
      }

      // ----- GameSettled events -----
      const settledLogs = await provider.getLogs({
        address: GAME_ADDRESS,
        topics: [GAME_SETTLED_TOPIC],
        fromBlock,
        toBlock,
      });

      if (settledLogs.length > 0) {
        console.log(`🎯 ${settledLogs.length} GameSettled event(s) detected`);

        for (const log of settledLogs) {
          const parsed = gameInterface.parseLog(log);
          const gameId = parsed.args.gameId;
          const games = loadGames();
          const game = games.find(g => g.id === Number(gameId));
          if (!game) continue;

          let onChain;
          try {
            onChain = await contract.games(gameId);
          } catch (err) {
            console.error(`Failed to fetch on-chain game ${gameId}:`, err);
            continue;
          }

          // If the game is settled on-chain but not in backend
          if (onChain.settled && !game.settled) {
            console.log(`[RECONCILE] Settling game ${game.id}`);

            let backendWinner;
            try {
              backendWinner = await contract.backendWinner(game.id);
            } catch {
              backendWinner = ethers.ZeroAddress;
            }

            game.settled = true;
            game.settledAt = new Date().toISOString();

            if (backendWinner && backendWinner !== ethers.ZeroAddress) {
              game.cancelled = false;
              game.winner = backendWinner.toLowerCase();
            } else {
              // Cancelled or no winner
              game.cancelled = true;
              game.winner = null;
            }

            dirty = true;
          } else if (!onChain.settled) {
            console.log(`[RECONCILE] Game ${game.id} not settled yet, skipping backendWinner`);
          }
        }

        // Save backend state after processing all settled logs
        saveGames(loadGames());
      }
      
      // ----- NFT transfer logs (VKIN & VQLE) -----
      const getTransferLogs = async (address) =>
        provider.getLogs({ address, topics: [TRANSFER_TOPIC], fromBlock, toBlock });

      const vkinLogs = await getTransferLogs(VKIN_CONTRACT_ADDRESS);
      const vqleLogs = await getTransferLogs(VQLE_CONTRACT_ADDRESS);

      const processLogs = (logs, contractName, contractInstance) => {
        for (const log of logs) {
          try {
            const parsed = contractInstance.interface.parseLog(log);
            const from = parsed.args.from ? String(parsed.args.from).toLowerCase() : null;
            const to = parsed.args.to ? String(parsed.args.to).toLowerCase() : null;

            const walletsToUpdate = [];

            if (from && from !== ethers.ZeroAddress) {
              deleteCache(`${contractName}_owned_${from}`);
              console.log(`♻️ ${contractName.toUpperCase()} cache invalidated for ${from}`);
              walletsToUpdate.push(from);
            }
            if (to && to !== ethers.ZeroAddress) {
              deleteCache(`${contractName}_owned_${to}`);
              console.log(`♻️ ${contractName.toUpperCase()} cache invalidated for ${to}`);
              walletsToUpdate.push(to);
            }

            // Auto-update owner cache asynchronously
            for (const wallet of walletsToUpdate) {
              updateWalletCache(wallet); // no await, runs in background
            }
          } catch (err) {
            console.warn(`⚠️ Failed to parse ${contractName.toUpperCase()} log:`, err);
          }
        }
      };

      processLogs(vkinLogs, "vkin", vkinContract);
      processLogs(vqleLogs, "vqle", vqleContract);

      lastBlock = toBlock;
      saveLastBlock(lastBlock);
      fromBlock = toBlock + 1;

      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("❌ Event poll error:", err.message);
  }
}, POLL_INTERVAL_MS);