import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Now we can define GAMES_FILE
export const GAMES_FILE = path.join(__dirname, "../games/games.json");

export function loadGames() {
  if (!fs.existsSync(GAMES_FILE)) {
    fs.writeFileSync(GAMES_FILE, "[]"); // create empty array if missing
  }
  const raw = fs.readFileSync(GAMES_FILE, "utf-8");
  return JSON.parse(raw);
}

export function saveGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}
