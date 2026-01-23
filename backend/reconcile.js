import { loadGames, saveGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";

const ZERO = ethers.ZeroAddress;

export async function reconcileAllGames() {
  const games = loadGames();
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
