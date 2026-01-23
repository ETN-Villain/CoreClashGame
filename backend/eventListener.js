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
import { deleteCache } from "./utils/ownerCache.js";
import { reconcileAllGames } from "./reconcile.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
const vkinContract = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKINABI, provider);
const vqleContract = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLEABI, provider);

const POLL_INTERVAL_MS = 6000;
const MAX_BLOCK_RANGE = 500; // safe range for RPC
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const gameInterface = new ethers.Interface(GameABI);
const GAME_SETTLED_TOPIC = gameInterface.getEvent("GameSettled").topic;

console.log("📡 CoreClash event indexer starting…");

let lastBlock = loadLastBlock() ?? ((await provider.getBlockNumber()) - 500);
console.log("▶ Starting from block", lastBlock);

// ── POLLING LOOP ──
setInterval(async () => {
  try {
    const currentBlock = await provider.getBlockNumber();
    if (currentBlock <= lastBlock) return;

    let fromBlock = lastBlock + 1;

    while (fromBlock <= currentBlock) {
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, currentBlock);
      console.log(`🔍 Fetching logs ${fromBlock} → ${toBlock}`);

      // ----- GameSettled logs -----
      const settledLogs = await provider.getLogs({
        address: GAME_ADDRESS,
        topics: [GAME_SETTLED_TOPIC],
        fromBlock,
        toBlock,
      });

// 🔥 authoritative sync
      if (settledLogs.length > 0) {
        console.log(`🎯 ${settledLogs.length} GameSettled event(s) detected`);
        try {
          await reconcileAllGames(); // authoritative sync
        } catch (err) {
          console.error("❌ Reconcile failed:", err);
        }
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

            if (from && from !== ethers.ZeroAddress) {
              deleteCache(`${contractName}_owned_${from}`);
              console.log(`♻️ ${contractName.toUpperCase()} cache invalidated for ${from}`);
            }
            if (to && to !== ethers.ZeroAddress) {
              deleteCache(`${contractName}_owned_${to}`);
              console.log(`♻️ ${contractName.toUpperCase()} cache invalidated for ${to}`);
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
