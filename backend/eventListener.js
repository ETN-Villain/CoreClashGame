import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import VKINABI from "../src/abis/VKINABI.json" assert { type: "json" };
import VQLEABI from "../src/abis/VQLEABI.json" assert { type: "json" };
import { GAME_ADDRESS, RPC_URL, VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "./config.js";
import { loadLastBlock, saveLastBlock } from "./utils/blockState.js";
import { handleEvent } from "./utils/handleEvent.js";
import { deleteCache } from "./utils/ownerCache.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
const vkinContract = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKINABI, provider);
const vqleContract = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLEABI, provider);

// ── CONFIG ──
const POLL_INTERVAL_MS = 6000;
const MAX_BLOCK_RANGE = 1000;
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

console.log("📡 CoreClash event indexer starting…");

// ── START BLOCK ──
let lastBlock = loadLastBlock() ?? ((await provider.getBlockNumber()) - 500);
console.log("▶ Starting from block", lastBlock);

// ── MAIN GAME EVENTS POLL ──
setInterval(async () => {
  try {
    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentBlock);

      console.log(`🔍 Fetching game logs ${fromBlock} → ${toBlock}`);

      const events = await gameContract.queryFilter("*", fromBlock, toBlock);

      for (const event of events) {
        await handleEvent(event);
      }

      lastBlock = toBlock;
      saveLastBlock(lastBlock);
      fromBlock = toBlock + 1;

      await new Promise(r => setTimeout(r, 200)); // polite delay
    }
  } catch (err) {
    console.error("❌ Game event poll error:", err.message);
  }
}, POLL_INTERVAL_MS);

// ── NFT TRANSFER CACHE INVALIDATION ──
setInterval(async () => {
  try {
    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentBlock);

      console.log(`♻️ Checking NFT transfers ${fromBlock} → ${toBlock}`);

      // VKIN transfers
      const vkinLogs = await provider.getLogs({
        address: VKIN_CONTRACT_ADDRESS,
        topics: [TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      });

      // VQLE transfers
      const vqleLogs = await provider.getLogs({
        address: VQLE_CONTRACT_ADDRESS,
        topics: [TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      });

      // Process VKIN logs
      for (const log of vkinLogs) {
        try {
          const parsed = vkinContract.interface.parseLog(log);
          const from = parsed.args.from.toLowerCase();
          const to = parsed.args.to.toLowerCase();

          if (from !== ethers.ZeroAddress) {
            deleteCache(`vkin_owned_${from}`);
            console.log(`♻️ VKIN cache invalidated for ${from}`);
          }
          if (to !== ethers.ZeroAddress) {
            deleteCache(`vkin_owned_${to}`);
            console.log(`♻️ VKIN cache invalidated for ${to}`);
          }
        } catch (parseErr) {
          console.warn("Failed to parse VKIN log:", parseErr);
        }
      }

      // Process VQLE logs
      for (const log of vqleLogs) {
        try {
          const parsed = vqleContract.interface.parseLog(log);
          const from = parsed.args.from.toLowerCase();
          const to = parsed.args.to.toLowerCase();

          if (from !== ethers.ZeroAddress) {
            deleteCache(`vqle_owned_${from}`);
            console.log(`♻️ VQLE cache invalidated for ${from}`);
          }
          if (to !== ethers.ZeroAddress) {
            deleteCache(`vqle_owned_${to}`);
            console.log(`♻️ VQLE cache invalidated for ${to}`);
          }
        } catch (parseErr) {
          console.warn("Failed to parse VQLE log:", parseErr);
        }
      }

      lastBlock = toBlock;
      saveLastBlock(lastBlock);
      fromBlock = toBlock + 1;

      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("❌ NFT transfer poll error:", err.message);
  }
}, POLL_INTERVAL_MS);