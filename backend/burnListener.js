// backend/burnListener.js
import { ethers } from "ethers";
import { sendTelegramGroupMessage, formatTokenAmount } from "./utils/telegramBot.js";
import { CORE_TOKEN_ADDRESS, RPC_URL } from "./config.js"; // adjust path if needed
import ERC20ABI from "../src/abis/ERC20ABI.json" with {type: "json"}; // reuse minimal ERC20 ABI for decimals/symbol
import { loadLastBlockLocked, saveLastBlockLocked } from "./utils/blockState.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

let running = false;

function topicAddress(address) {
  return ethers.zeroPadValue(address, 32).toLowerCase();
}

function shortHash(hash) {
  if (!hash) return "Unknown";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export async function startCoreBurnListener() {
  if (running) return;
  running = true;

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

  let lastProcessedBlock = await loadLastBlockLocked();
  const currentBlock = await provider.getBlockNumber();

  if (lastProcessedBlock == null) {
    lastProcessedBlock = currentBlock;
    await saveLastBlockLocked(lastProcessedBlock);
  }

  console.log(`[BurnListener] Watching ${symbol} burns from block ${lastProcessedBlock}`);

  provider.on("block", async (blockNumber) => {
    if (blockNumber <= lastProcessedBlock) return;

    const fromBlock = lastProcessedBlock + 1;
    const toBlock = blockNumber;

    try {
      const logs = await provider.getLogs({
        address: CORE_TOKEN_ADDRESS,
        fromBlock,
        toBlock,
        topics: [
          TRANSFER_TOPIC,
          null,
          topicAddress(ZERO_ADDRESS),
        ],
      });

      for (const log of logs) {
        try {
          const from = ethers.getAddress(`0x${log.topics[1].slice(26)}`);
          const value = BigInt(log.data);
          const prettyAmount = formatTokenAmount(value.toString(), decimals, 4);

          const text =
            `🔥 <b>${symbol} Burn Detected</b>\n` +
            `Amount: <b>${prettyAmount} ${symbol}</b>\n` +
            `From: <code>${from.slice(0, 6)}...${from.slice(-4)}</code>\n` +
            `Block: <b>${log.blockNumber}</b>\n` +
            `Tx: <code>${shortHash(log.transactionHash)}</code>`;

          try {
            await sendTelegramGroupMessage(text, {
              message_thread_id: 1, // hardcoded General topic
            });
            console.log(
              `[BurnListener] Telegram sent for ${prettyAmount} ${symbol} burn in tx ${log.transactionHash}`
            );
          } catch (tgErr) {
            console.error("[BurnListener] Telegram send failed:", tgErr.message || tgErr);
          }
        } catch (logErr) {
          console.error("[BurnListener] Failed to process burn log:", logErr);
        }
      }

      lastProcessedBlock = toBlock;
      await saveLastBlockLocked(lastProcessedBlock);
    } catch (err) {
      console.error("[BurnListener] getLogs failed:", err);
    }
  });
}