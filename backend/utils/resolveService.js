import { loadGames, saveGames } from "../store/gamesStore.js";
import { resolveGame } from "../gameLogic.js";

export async function resolveAllGames() {
  const games = loadGames();
  let changed = false;

  for (const game of games) {
    if (!game.player2) continue;
    if (game.settled || game.settledAt) continue;

    const resolved = await resolveGame(game);
    if (resolved) {
      game.settled = true;
      changed = true;
    }
  }

  if (changed) {
    saveGames(games);
  }

  return changed;
}
