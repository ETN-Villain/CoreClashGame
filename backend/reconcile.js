import { readGames, writeGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";
import { withLock } from "./utils/mutex.js";
import PQueue from "p-queue"; // for throttling promises
import { ZERO } from "./constants.js";

const ZERO = ethers.ZeroAddress;

// -------------------- DISCOVER MISSING GAMES --------------------
// backend/schedulers.js
const queue = new PQueue({ concurrency: 5 }); // max 5 RPC calls at a time

export async function discoverMissingGamesScheduled() {
  const games = readGames();
  const knownIds = new Set(games.map(g => g.id));
  let added = 0;

  let gamesLength;
  try {
    gamesLength = Number(await contract.gamesLength());
  } catch (err) {
    console.error("[DISCOVER SCHEDULED] Failed to fetch gamesLength:", err.message);
    return;
  }

  const missingIds = [];
  for (let id = 0; id < gamesLength; id++) {
    if (!knownIds.has(id)) missingIds.push(id);
  }

  if (missingIds.length === 0) return;

  await Promise.all(
    missingIds.map(id =>
      queue.add(async () => {
        try {
          const onChain = await contract.games(id);
          if (!onChain || onChain.player1 === ZERO) return;

          games.push({
            id,
            player1: onChain.player1.toLowerCase(),
            player2: onChain.player2?.toLowerCase() || null,
            stakeAmount: onChain.stakeAmount?.toString() || "0",
            stakeToken: onChain.stakeToken || null,
            settled: !!onChain.settled,
            cancelled: onChain.cancelled === true,
            winner: onChain.settled ? onChain.winner?.toLowerCase() : null,
            player1Revealed: !!onChain.player1Revealed,
            player2Revealed: !!onChain.player2Revealed,
            createdAt: new Date().toISOString(),
          });

          added++;
        } catch (err) {
          console.warn(`[DISCOVER SCHEDULED] Failed on game ${id}:`, err.message);
        }
      })
    )
  );

  if (added > 0) {
    games.sort((a, b) => a.id - b.id);
    writeGames(games);
    console.log(`[DISCOVER SCHEDULED] Added ${added} missing game(s)`);
  }
}

// Schedule every 1 minute
setInterval(discoverMissingGamesScheduled, 60 * 1000);

// -------------------- RECONCILE ALL GAMES --------------------
export async function reconcileAllGamesScheduled() {
  await withLock(async () => {
  const games = readGames();
  let dirty = false;

  const queue = new PQueue({ concurrency: 5 });

  await Promise.all(
    games.map(game =>
      queue.add(async () => {
        try {
          const onChain = await contract.games(game.id);
          if (!onChain?.settled) return;

          game.settled = true;
          game.settledAt = new Date().toISOString();

          let backendWinner;
          try {
            backendWinner = await contract.backendWinner(game.id);
          } catch {
            backendWinner = null;
          }

          if (backendWinner && backendWinner !== ZERO) {
            game.cancelled = false;
            game.winner = backendWinner.toLowerCase();
          } else {
            game.cancelled = true;
            game.winner = null;
          }

          if (onChain.player1Revealed && !game.player1Revealed) {
            game.player1Revealed = true;
            dirty = true;
          }

          if (onChain.player2Revealed && !game.player2Revealed) {
            game.player2Revealed = true;
            dirty = true;
          }

          if (game._reveal) {
            delete game._reveal;
            dirty = true;
          }
        } catch (err) {
          console.warn(`[RECONCILE SCHEDULED] Failed for game ${game.id}:`, err.message);
        }
      })
    )
  );

  if (dirty) {
    writeGames(games);
    console.log("[RECONCILE SCHEDULED] games.json updated");
  }
  });
}

// Schedule every 10 minutes
setInterval(reconcileAllGamesScheduled, 10 * 60 * 1000);