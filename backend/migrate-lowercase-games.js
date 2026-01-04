import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAMES_FILE = path.join(__dirname, "./games/games.json");

if (!fs.existsSync(GAMES_FILE)) {
  console.error("games.json not found");
  process.exit(1);
}

const games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));

let changed = false;

for (const g of games) {
  if (g.creator) {
    const lc = g.creator.toLowerCase();
    if (g.creator !== lc) {
      g.creator = lc;
      changed = true;
    }
  }

  if (g.player1) {
    const lc = g.player1.toLowerCase();
    if (g.player1 !== lc) {
      g.player1 = lc;
      changed = true;
    }
  }

  if (g.player2) {
    const lc = g.player2.toLowerCase();
    if (g.player2 !== lc) {
      g.player2 = lc;
      changed = true;
    }
  }

  if (g._reveal && typeof g._reveal === "object") {
    const fixed = {};
    for (const [addr, reveal] of Object.entries(g._reveal)) {
      fixed[addr.toLowerCase()] = reveal;
    }
    g._reveal = fixed;
    changed = true;
  }
}

if (!changed) {
  console.log("No changes needed — games already normalized");
  process.exit(0);
}

fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
console.log("Migration complete: addresses normalized to lowercase");
