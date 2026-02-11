import { readGames, writeGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";
import { withLock } from "./utils/mutex.js";
import PQueue from "p-queue";
import { isCatchingUp } from "./eventListener.js";

const ZERO = ethers.ZeroAddress;
const RPC_CONCURRENCY = 5;

/* ================================================================
   DISCOVER MISSING GAMES (every 1 min)
   ================================================================ */

const discoverQueue = new PQueue({ concurrency: RPC_CONCURRENCY });

export async function discoverMissingGamesScheduled() {
  const games = readGames();
  const knownIds = new Set(games.map(g => g.id));
  let added = 0;

  let gamesLength;
  try {
    gamesLength = Number(await contract.gamesLength());
  } catch (err) {
    console.error("[DISCOVER] Failed to fetch gamesLength:", err.message);
    return;
  }

  const missingIds = [];
  for (let id = 0; id < gamesLength; id++) {
    if (!knownIds.has(id)) missingIds.push(id);
  }

  if (missingIds.length === 0) return;

  await Promise.all(
    missingIds.map(id =>
      discoverQueue.add(async () => {
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
          console.warn(`[DISCOVER] Failed on game ${id}:`, err.message);
        }
      })
    )
  );

  if (added > 0) {
    games.sort((a, b) => a.id - b.id);
    writeGames(games);
    console.log(`[DISCOVER] Added ${added} missing game(s)`);
  }
}

// every 1 minute
setInterval(discoverMissingGamesScheduled, 60 * 1000);

/* ================================================================
   RECONCILE ALL GAMES (every 10 min)
   ================================================================ */

const reconcileQueue = new PQueue({ concurrency: RPC_CONCURRENCY });

export async function reconcileAllGamesScheduled() {
if (isCatchingUp) {
  console.log("[SKIP] Skipping reconcile while catching up");
  return;
}
  await withLock(async () => {
    const games = readGames();
    let dirty = false;

    await Promise.all(
      games.map(game =>
        reconcileQueue.add(async () => {
          try {
            const onChain = await contract.games(game.id);

// ---- Settlement sync (trust chain only) ----
if (onChain.settled) {
  if (!game.settled) {
    game.settled = true;
    game.settledAt = new Date().toISOString();
    dirty = true;
  }

  const chainWinner = onChain.winner?.toLowerCase();

  if (chainWinner && chainWinner !== ZERO) {
    if (game.backendWinner !== chainWinner) {
      game.backendWinner = chainWinner;
      game.winner = chainWinner;
      game.cancelled = false;
      dirty = true;
    }
  } else {
    // tie or cancelled
    if (!game.cancelled) {
      game.cancelled = true;
      game.winner = null;
      game.backendWinner = null;
      dirty = true;
    }
  }
}

            // ---- Winner reconciliation (trust chain) ----
let backendWinner;
try {
  backendWinner = await contract.backendWinner(game.id);
} catch (err) {
  if (err.message?.includes("Too many requests")) {
    console.warn(`[RECONCILE] Rate-limited for game ${game.id}, retrying 5s...`);
    await new Promise(r => setTimeout(r, 5000));
    backendWinner = await contract.backendWinner(game.id).catch(() => null);
  } else {
    console.warn(`[RECONCILE] backendWinner fetch failed for game ${game.id}`);
    return;
  }
}

            if (backendWinner === ZERO) {
              // cancelled or tie
              if (!game.cancelled) {
                game.cancelled = true;
                game.winner = null;
                game.backendWinner = null;
                dirty = true;
              }
            } else {
              const winner = backendWinner.toLowerCase();
              if (game.backendWinner !== winner) {
                game.cancelled = false;
                game.backendWinner = winner;
                game.winner = winner;
                dirty = true;
              }
            }

            // ---- Reveal flags ----
            if (onChain.player1Revealed && !game.player1Revealed) {
              game.player1Revealed = true;
              dirty = true;
            }

            if (onChain.player2Revealed && !game.player2Revealed) {
              game.player2Revealed = true;
              dirty = true;
            }

            // ---- Cleanup legacy temp fields ----
            if (game._reveal) {
              delete game._reveal;
              dirty = true;
            }
          } catch (err) {
            console.warn(
              `[RECONCILE] Failed for game ${game.id}:`,
              err.message
            );
          }
        })
      )
    );

    if (dirty) {
      writeGames(games);
      console.log("[RECONCILE] games.json updated");
    }
  });
}

// every 10 minutes
setInterval(reconcileAllGamesScheduled, 10 * 60 * 1000);
