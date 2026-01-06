import fs from "fs";
import path from "path";

const GAMES_FILE = path.join(process.cwd(), "games", "games.json");

// Read games.json safely
export function readGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
  } catch {
    return [];
  }
}

// Write to games.json
export function writeGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), "utf8");
}

export default { readGames, writeGames };