// backfillSettledTx.js (in backend/ root)

import { ethers } from "ethers";
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log("Script running from:", __dirname);

const GAME_ABI_PATH = join(__dirname, '..', 'src', 'abis', 'GameABI.json');
console.log("Loading ABI from:", GAME_ABI_PATH);
const GameABI = require(GAME_ABI_PATH);

const { GAME_ADDRESS, RPC_URL } = await import("./config.js");
const { loadGames, saveGames } = await import("./gameLogic.js");

console.log("Imported config:", { GAME_ADDRESS, RPC_URL });

const provider = new ethers.JsonRpcProvider(RPC_URL);
const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);

// ── CONFIG ──
const BLOCK_CHUNK_SIZE = 5000;
const DELAY_MS_PER_CHUNK = 1000;
const START_BLOCK = 11593135;  // your desired start

(async () => {
  console.log("Starting one-time GameSettled backfill with chunking...");

  let latestBlock;
  try {
    latestBlock = await provider.getBlockNumber();
    console.log(`Current chain head: ${latestBlock}`);
  } catch (err) {
    console.error("Failed to get latest block:", err.message);
    return;
  }

  const games = loadGames();
  console.log("Loaded games count:", games.length);

  let updatedCount = 0;

  for (const game of games) {
    if (!game.settled || game.settleTxHash) {
      console.log(`Skipping game ${game.id} (not settled or already has tx hash)`);
      continue;
    }

    console.log(`\nChecking game ${game.id}...`);

    let events = [];
    let fromBlock = START_BLOCK;
    let chunkIndex = 0;

    console.log(`Starting search from block ${fromBlock} to ${latestBlock}`);

    while (fromBlock <= latestBlock) {
      chunkIndex++;
      const toBlock = Math.min(fromBlock + BLOCK_CHUNK_SIZE - 1, latestBlock);

      console.log(`  Chunk ${chunkIndex}: blocks ${fromBlock} → ${toBlock}`);

      try {
        const filter = gameContract.filters.GameSettled(game.id);
        const chunkEvents = await gameContract.queryFilter(filter, fromBlock, toBlock);

        if (chunkEvents.length > 0) {
          console.log(`    Found ${chunkEvents.length} events in this chunk`);
        }

        events = events.concat(chunkEvents);

        fromBlock = toBlock + 1;
      } catch (chunkErr) {
        console.error(`    Chunk ${chunkIndex} failed:`, chunkErr.message);
        // Continue to next chunk instead of stopping completely
        fromBlock = toBlock + 1;
      }

      // Delay between chunks
      await new Promise(r => setTimeout(r, DELAY_MS_PER_CHUNK));
    }

    if (events.length === 0) {
      console.log(`No GameSettled event found for game ${game.id}`);
      continue;
    }

    console.log(`Total events found for game ${game.id}: ${events.length}`);

    const latestEvent = events[events.length - 1];
    const txHash = latestEvent.transactionHash;

    console.log(`Latest settlement tx hash: ${txHash}`);

    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        console.warn("Receipt not found for tx", txHash);
        continue;
      }
    } catch (receiptErr) {
      console.warn("Receipt fetch failed:", receiptErr.message);
    }

    game.settleTxHash = txHash;
    updatedCount++;
    console.log(`Backfilled settleTxHash for game ${game.id}: ${txHash}`);
  }

  if (updatedCount > 0) {
    saveGames(games);
    console.log(`Successfully backfilled ${updatedCount} games.`);
  } else {
    console.log("No games needed backfilling.");
  }

  console.log("Backfill complete.");
})();