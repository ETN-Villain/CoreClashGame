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
   RECONCILE ACTIVE GAMES ONLY (every 2 min)
   ================================================================ */

const reconcileQueue = new PQueue({ concurrency: RPC_CONCURRENCY });

export async function reconcileActiveGamesScheduled() {
  if (isCatchingUp) {
    console.log("[SKIP] Skipping reconcile while catching up");
    return;
  }

  await withLock(async () => {
    const games = readGames();

    // 🔥 Only reconcile unsettled + non-cancelled games
    const activeGames = games.filter(
      g => !g.settled && !g.cancelled
    );

    if (activeGames.length === 0) {
      console.log("[RECONCILE] No active games to process");
      return;
    }

    let dirty = false;

    await Promise.all(
      activeGames.map(game =>
        reconcileQueue.add(async () => {
          try {
            const onChain = await contract.games(game.id);

// ---- Sync players (Chain is Truth) ----
const chainP1 = onChain.player1?.toLowerCase();
const chainP2 = onChain.player2?.toLowerCase();

if (game.player1 !== chainP1) {
  game.player1 = chainP1;
  dirty = true;
}

if (game.player2 !== chainP2) {
  game.player2 = chainP2;
  dirty = true;
}

            /* -----------------------------
               Sync cancelled state
            ------------------------------*/
            if (game.cancelled !== onChain.cancelled) {
              game.cancelled = onChain.cancelled;
              dirty = true;
            }

            /* -----------------------------
               Settlement Sync (Chain = Truth)
            ------------------------------*/
            if (onChain.settled) {
              game.settled = true;
              game.settledAt = new Date().toISOString();

              const chainWinner = onChain.winner?.toLowerCase();

              if (chainWinner && chainWinner !== ZERO) {
                game.backendWinner = chainWinner;
                game.winner = chainWinner;
                game.cancelled = false;
              } else {
                game.cancelled = true;
                game.winner = null;
                game.backendWinner = null;
              }

              dirty = true;
            }

            /* -----------------------------
               Reveal flags
            ------------------------------*/
            if (onChain.player1Revealed && !game.player1Revealed) {
              game.player1Revealed = true;
              dirty = true;
            }

            if (onChain.player2Revealed && !game.player2Revealed) {
              game.player2Revealed = true;
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
      console.log("[RECONCILE] Active games updated");
    }
  });
}

// ⏱ Run every 2 minutes
setInterval(reconcileActiveGamesScheduled, 2 * 60 * 1000);

/* ================================================================
   FULL RECONCILE SWEEP (Batched + Safe)
   ================================================================ */

const FULL_SWEEP_BATCH_SIZE = 50;

export async function reconcileFullSweep() {
  if (isCatchingUp) {
    console.log("[FULL SWEEP] Skipping while catching up");
    return;
  }

  console.log("[FULL SWEEP] Starting hourly reconciliation...");

  await withLock(async () => {
    const games = readGames();
    let dirty = false;

    for (let i = 0; i < games.length; i += FULL_SWEEP_BATCH_SIZE) {
      const batch = games.slice(i, i + FULL_SWEEP_BATCH_SIZE);

      await Promise.all(
        batch.map(async (game) => {
          try {
            const onChain = await contract.games(game.id);

// ---- Sync players (Chain is Truth) ----
const chainP1 = onChain.player1?.toLowerCase();
const chainP2 = onChain.player2?.toLowerCase();

if (game.player1 !== chainP1) {
  game.player1 = chainP1;
  dirty = true;
}

if (game.player2 !== chainP2) {
  game.player2 = chainP2;
  dirty = true;
}

            // ---- Sync cancelled ----
            if (game.cancelled !== onChain.cancelled) {
              game.cancelled = onChain.cancelled;
              dirty = true;
            }

            // ---- Sync settlement ----
            if (game.settled !== onChain.settled) {
              game.settled = onChain.settled;
              game.settledAt = onChain.settled
                ? new Date().toISOString()
                : null;
              dirty = true;
            }

            // ---- Sync winner ----
            if (onChain.settled) {
              const chainWinner = onChain.winner?.toLowerCase();

              if (chainWinner && chainWinner !== ZERO) {
                if (game.backendWinner !== chainWinner) {
                  game.backendWinner = chainWinner;
                  game.winner = chainWinner;
                  game.cancelled = false;
                  dirty = true;
                }
              } else {
                if (!game.cancelled || game.backendWinner) {
                  game.cancelled = true;
                  game.backendWinner = null;
                  game.winner = null;
                  dirty = true;
                }
              }
            }

            // ---- Sync reveals ----
            if (onChain.player1Revealed && !game.player1Revealed) {
              game.player1Revealed = true;
              dirty = true;
            }

            if (onChain.player2Revealed && !game.player2Revealed) {
              game.player2Revealed = true;
              dirty = true;
            }

          } catch (err) {
            console.warn(
              `[FULL SWEEP] Failed for game ${game.id}:`,
              err.message
            );
          }
        })
      );

      // Small delay between batches to avoid burst throttling
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (dirty) {
      writeGames(games);
      console.log("[FULL SWEEP] games.json updated from chain truth");
    } else {
      console.log("[FULL SWEEP] No drift detected");
    }
  });
}

setInterval(reconcileFullSweep, 60 * 60 * 1000);