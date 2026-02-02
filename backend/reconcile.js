import { readGames, writeGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";

const ZERO = ethers.ZeroAddress;

// -------------------- DISCOVER MISSING GAMES --------------------
export async function discoverMissingGames() {
  const games = readGames();
  const knownIds = new Set(games.map(g => g.id));
  let added = 0;

  let gamesLength = 0;
  try {
    gamesLength = Number(await contract.gamesLength());
  } catch (err) {
    console.error("[DISCOVER] Failed to get gamesLength:", err.message);
    return games; // return existing games
  }

  for (let id = 0; id < gamesLength; id++) {
    if (knownIds.has(id)) continue;

    let onChain;
    try {
      onChain = await contract.games(id);
    } catch (err) {
      // handle RPC rate-limit
      if (err.info?.error?.message?.includes("Too many requests")) {
        console.warn(`[DISCOVER] Rate-limited on game ${id}, retrying in 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        try {
          onChain = await contract.games(id);
        } catch (retryErr) {
          console.error(`[DISCOVER] Retry failed for game ${id}:`, retryErr.message);
          continue;
        }
      } else {
        console.error(`[DISCOVER] Failed to load on-chain game ${id}:`, err.message);
        continue; // skip this game
      }
    }

    if (!onChain || onChain.player1 === ZERO) continue;

    games.push({
      id,
      player1: typeof onChain.player1 === "string" ? onChain.player1.toLowerCase() : null,
      player2: typeof onChain.player2 === "string" ? onChain.player2.toLowerCase() : null,
      stakeAmount: onChain.stakeAmount?.toString() || "0",
      stakeToken: onChain.stakeToken || null,
      settled: !!onChain.settled,
      cancelled: onChain.cancelled === true,
      winner: onChain.settled && typeof onChain.winner === "string" ? onChain.winner.toLowerCase() : null,
      player1Revealed: !!onChain.player1Revealed,
      player2Revealed: !!onChain.player2Revealed,
      createdAt: new Date().toISOString(),
      _reveal: {}, // placeholder for backend reveal
    });

    added++;
  }

  if (games.length > gamesLength) {
    console.warn(`[WARN] Backend has ${games.length} games, but chain reports ${gamesLength}`);
  }

  if (added > 0) {
    games.sort((a, b) => a.id - b.id);
    writeGames(games);
    console.log(`[DISCOVER] Added ${added} missing game(s)`);
  }

  return games;
}

// -------------------- RECONCILE ALL GAMES --------------------
export async function reconcileAllGames() {
  const games = await discoverMissingGames();
  let dirty = false;

  for (const game of games) {
    let onChain;
    try {
      onChain = await contract.games(game.id);
    } catch (err) {
      console.error(`[RECONCILE] Failed to fetch on-chain game ${game.id}:`, err.message);
      continue;
    }

    // skip if not settled
    if (!onChain?.settled) continue;

    // prevent overwriting terminal state incorrectly
    if (game.settled === true && !onChain.settled) {
      console.warn(`[RECONCILE] Backend settled but chain not settled for game ${game.id}`);
      continue;
    }

    // detect desync
    if (game.settled && onChain.winner !== game.winner) {
      console.error(`[DESYNC] Game ${game.id} winner mismatch`, { chain: onChain.winner, backend: game.winner });
    }

    // fetch backendWinner safely
    let backendWinner;
    try {
      backendWinner = await contract.backendWinner(game.id);
    } catch {
      backendWinner = null;
    }

    game.settled = true;
    game.settledAt = new Date().toISOString();

    if (backendWinner && backendWinner !== ZERO) {
      game.cancelled = false;
      game.winner = typeof backendWinner === "string" ? backendWinner.toLowerCase() : null;
    } else {
      game.cancelled = true;
      game.winner = null;
    }

    // update reveal flags safely
    game.player1Revealed = !!onChain.player1Revealed || !!game._reveal?.player1;
    game.player2Revealed = !!onChain.player2Revealed || !!game._reveal?.player2;

    dirty = true;
  }

  if (dirty) {
    writeGames(games);
    console.log("[RECONCILE] games.json updated");
  }
}