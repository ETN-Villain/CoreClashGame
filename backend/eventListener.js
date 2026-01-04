import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import { GAME_ADDRESS, RPC_URL } from "./config.js";
import { loadLastBlock, saveLastBlock } from "./utils/blockState.js";
import { handleEvent } from "./utils/handleEvent.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);

// ---- CONFIG ----
const POLL_INTERVAL_MS = 6000;
const MAX_BLOCK_RANGE = 1000;

console.log("📡 CoreClash event indexer starting…");

// ---- START BLOCK ----
let lastBlock =
  loadLastBlock() ??
  ((await provider.getBlockNumber()) - 500); // safe bootstrap window

console.log("▶ Starting from block", lastBlock);

// ---- POLLING LOOP ----
setInterval(async () => {
  try {
    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(
        fromBlock + MAX_BLOCK_RANGE - 1,
        currentBlock
      );

      console.log(`🔍 Fetching logs ${fromBlock} → ${toBlock}`);

      const events = await contract.queryFilter(
        "*",
        fromBlock,
        toBlock
      );

      for (const event of events) {
        await handleEvent(event);
      }

      lastBlock = toBlock;
      saveLastBlock(lastBlock);

      fromBlock = toBlock + 1;

      // Optional RPC-friendly delay
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("❌ Event poll error:", err.message);
  }
}, POLL_INTERVAL_MS);
