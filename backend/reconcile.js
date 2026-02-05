import { readGames, writeGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";
import { withLock } from "./utils/mutex.js";

const ZERO = ethers.ZeroAddress;

// -------------------- DISCOVER MISSING GAMES --------------------
export async function discoverMissingGames() {
  const games = readGames();
  const knownIds = new Set(games.map(g => g.id));
  const maxKnownId = games.length
    ? Math.max(...games.map(g => g.id))
    : -1;

  let gamesLength;
  try {
    gamesLength = Number(await contract.gamesLength());
  } catch (err) {
    console.error("[DISCOVER] Failed to get gamesLength:", err.message);
    return { added: 0 };
  }

  let added = 0;

  // 🔥 Only fetch new IDs
  for (let id = maxKnownId + 1; id < gamesLength; id++) {
    let onChain;
    try {
      onChain = await contract.games(id);
    } catch {
      break; // stop on RPC instability
    }

    if (!onChain || onChain.player1 === ZERO) continue;

    games.push({
      id,
      player1: onChain.player1.toLowerCase(),
      player2: onChain.player2?.toLowerCase() || null,
      stakeAmount: onChain.stakeAmount?.toString() || "0",
      stakeToken: onChain.stakeToken || null,
      settled: !!onChain.settled,
      cancelled: !!onChain.cancelled,
      winner: onChain.settled && onChain.winner !== ZERO
        ? onChain.winner.toLowerCase()
        : null,
      player1Revealed: !!onChain.player1Revealed,
      player2Revealed: !!onChain.player2Revealed,
      createdAt: new Date().toISOString(),
    });

    added++;
  }

  if (added > 0) {
    writeGames(games);
    console.log(`[DISCOVER] Added ${added} new games`);
  }

  return { added };
}

// -------------------- RECONCILE ALL GAMES --------------------
export async function reconcileAllGames() {
  await withLock(async () => {
  let games = readGames();
  let dirty = false;

  // 1️⃣ Append-only discovery
  const { added } = await discoverMissingGames();
  if (added > 0) {
    games = readGames(); // re-read after disk write
    dirty = true;
  }

  for (const game of games) {
    let onChain;
    try {
      onChain = await contract.games(game.id);
    } catch {
      continue;
    }

    // 2️⃣ Reveal flags are safe mirrors
    if (onChain.player1Revealed && !game.player1Revealed) {
      game.player1Revealed = true;
      dirty = true;
    }

    if (onChain.player2Revealed && !game.player2Revealed) {
      game.player2Revealed = true;
      dirty = true;
    }

    // 3️⃣ Settlement mirror (non-authoritative)
    if (onChain.settled && !game.settled) {
      game.settled = true;
      game.settledAt ??= new Date().toISOString();
      dirty = true;
    }

    // 4️⃣ Winner mirror ONLY if backend missing
    if (onChain.settled && !game.winner) {
      try {
        const backendWinner = await contract.backendWinner(game.id);
        if (backendWinner && backendWinner !== ZERO) {
          game.winner = backendWinner.toLowerCase();
          game.cancelled = false;
          dirty = true;
        }
      } catch {
        // ignore
      }
    }
  }

  if (dirty) {
    writeGames(games);
    console.log("[RECONCILE] games.json updated safely");
  }
});
}