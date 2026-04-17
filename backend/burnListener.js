// backend/burnListener.js
import { ethers } from "ethers";
import { sendTelegramGroupMessage, formatTokenAmount } from "./utils/telegramBot.js";
import { CORE_TOKEN_ADDRESS, RPC_URL } from "./config.js"; // adjust path if needed
import { ERC20ABI } from "../src/abis/ERC20ABI.json"; // reuse minimal ERC20 ABI for decimals/symbol

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// Minimal ERC20 ABI just for decimals/symbol parsing if you want it
const ERC20_MIN_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

let lastProcessedBlock = null;
let isRunning = false;

function topicAddress(address) {
  return ethers.zeroPadValue(address, 32).toLowerCase();
}

export async function startCoreBurnListener() {
  if (isRunning) return;
  isRunning = true;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const token = new ethers.Contract(CORE_TOKEN_ADDRESS, ERC20ABI, provider);

  let decimals = 18;
  let symbol = "CORE";

  try {
    decimals = await token.decimals();
  } catch {}
  try {
    symbol = await token.symbol();
  } catch {}

  try {
    const currentBlock = await provider.getBlockNumber();
    lastProcessedBlock = currentBlock;
    console.log(`[BurnListener] starting from block ${lastProcessedBlock}`);
  } catch (err) {
    console.error("[BurnListener] failed to get starting block:", err);
    isRunning = false;
    return;
  }

  provider.on("block", async (blockNumber) => {
    if (lastProcessedBlock == null) {
      lastProcessedBlock = blockNumber - 1;
    }

    if (blockNumber <= lastProcessedBlock) return;

    const fromBlock = lastProcessedBlock + 1;
    const toBlock = blockNumber;

    try {
      const logs = await provider.getLogs({
        address: CORE_TOKEN,
        fromBlock,
        toBlock,
        topics: [
          TRANSFER_TOPIC,
          null,
          topicAddress(ZERO_ADDRESS), // indexed "to" == zero address
        ],
      });

      for (const log of logs) {
        try {
          const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
          const burnedRaw = BigInt(log.data);
          const burnedFormatted = formatTokenAmount(burnedRaw.toString(), decimals, 4);

          const message =
            `🔥 <b>${symbol} Burn Detected</b>\n` +
            `Amount: <b>${burnedFormatted} ${symbol}</b>\n` +
            `From: <code>${from.slice(0, 6)}...${from.slice(-4)}</code>\n` +
            `Block: <b>${log.blockNumber}</b>\n` +
            `Tx: <code>${log.transactionHash.slice(0, 10)}...${log.transactionHash.slice(-8)}</code>`;

          await sendTelegramGroupMessage(message, {
            message_thread_id: 1, // 👈 hardcode General topic
        });
          console.log(
            `[BurnListener] burn sent to Telegram: ${burnedFormatted} ${symbol} in tx ${log.transactionHash}`
          );
        } catch (innerErr) {
          console.error("[BurnListener] failed to process burn log:", innerErr);
        }
      }

      lastProcessedBlock = toBlock;
    } catch (err) {
      console.error("[BurnListener] getLogs failed:", err);
    }
  });

  provider._websocket?.on?.("error", (err) => {
    console.error("[BurnListener] websocket error:", err);
  });

  console.log("[BurnListener] live");
}