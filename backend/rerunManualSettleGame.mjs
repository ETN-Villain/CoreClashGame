import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveGame } from "./gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔧 Adjust if your games.json lives elsewhere
const GAMES_PATH = path.join(__dirname, "games", "games.json");

function loadGames() {
  return JSON.parse(fs.readFileSync(GAMES_PATH, "utf8"));
}

function saveGames(games) {
  fs.writeFileSync(GAMES_PATH, JSON.stringify(games, null, 2));
}

async function rerunManualSettle(gameId) {
  const games = loadGames();
  const game = games.find(g => g.id === gameId);

  if (!game) {
    console.error(`❌ Game ${gameId} not found`);
    return;
  }

  if (!game._reveal?.player1 || !game._reveal?.player2) {
    console.error("❌ Both players must reveal first");
    return;
  }

  console.log(`🔁 Re-running backend resolution for game ${gameId}`);

  const resolved = await resolveGame(game);
  if (!resolved) {
    console.error("❌ resolveGame failed");
    return;
  }

  // ✅ Force backend truth to match logic
  game.cancelled = false;
  game.roundResults = resolved.roundResults;
  game.winner = resolved.winner || null;
  game.tie = resolved.tie;
  game.backendWinner = resolved.winner || null;
  game.winnerResolvedAt = new Date().toISOString();

  // DO NOT touch cancelled / settled flags (chain is truth)
  saveGames(games);

  console.log("✅ Backend repaired successfully:");
  console.log({
    winner: game.winner,
    tie: game.tie,
    rounds: game.roundResults.length,
    cancelled: game.cancelled
  });
}

await rerunManualSettle(9);
process.exit(0);
