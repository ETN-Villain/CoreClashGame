import { loadGames, saveGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";

const ZERO = ethers.ZeroAddress;

export async function discoverMissingGames() {
  const games = loadGames();
  const knownIds = new Set(games.map(g => g.id));

  let added = 0;

  for (let id = 0; id < 1000; id++) { // cap for safety
    if (knownIds.has(id)) continue;

    const onChain = await contract.games(id);
    if (onChain.player1 === ethers.ZeroAddress) continue;

    console.log(`[DISCOVER] Found missing game ${id}`);

    games.push({
      id,
      player1: onChain.player1.toLowerCase(),
      player2: onChain.player2.toLowerCase(),
      stakeAmount: onChain.stakeAmount.toString(),
      stakeToken: onChain.stakeToken,
      settled: onChain.settled,
      cancelled: false,
      winner: null,
      createdAt: new Date().toISOString(),
    });

    added++;
  }

  if (added > 0) {
    games.sort((a, b) => a.id - b.id);
    saveGames(games);
    console.log(`[DISCOVER] Added ${added} missing game(s)`);
  }

  return games;
}

export async function reconcileAllGames() {
const games = await discoverMissingGames();
  let dirty = false;

  for (const game of games) {
    const onChain = await contract.games(game.id);

    // Not terminal on-chain → ignore
    if (!onChain.settled) continue;

    // Already reconciled
    if (game.settled === true) continue;

    console.log(`[RECONCILE] Settling game ${game.id}`);

    const backendWinner = await contract.backendWinner(game.id);

    game.settled = true;
    game.settledAt = new Date().toISOString();

    if (backendWinner && backendWinner !== ZERO) {
      // Normal resolved game
      game.cancelled = false;
      game.winner = backendWinner.toLowerCase();
    } else {
      // Cancelled game (includes cancelUnjoinedGame)
      game.cancelled = true;
      game.winner = null;
    }

    dirty = true;
  }

  if (dirty) {
    saveGames(games);
    console.log("[RECONCILE] games.json updated");
  }
}
