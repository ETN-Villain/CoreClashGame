import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, "games.json");

// Read games.json
let games;
try {
  const rawData = fs.readFileSync(filePath, "utf-8");
  games = JSON.parse(rawData);
} catch (err) {
  console.error("Error reading games.json:", err);
  process.exit(1);
}

// Convert _reveal to playerXReveal
games = games.map(game => {
  const updatedGame = { ...game };

  if (updatedGame._reveal) {
    // move reveal data
    updatedGame.player1Reveal = updatedGame._reveal.player1 || null;
    updatedGame.player2Reveal = updatedGame._reveal.player2 || null;

    // set booleans based on presence of reveal
    updatedGame.player1Revealed = !!updatedGame.player1Reveal;
    updatedGame.player2Revealed = !!updatedGame.player2Reveal;

    // remove old _reveal
    delete updatedGame._reveal;
  } else {
    // ensure booleans exist
    updatedGame.player1Revealed = updatedGame.player1Revealed || false;
    updatedGame.player2Revealed = updatedGame.player2Revealed || false;
  }

  return updatedGame;
});

// Backup the original file
fs.copyFileSync(filePath, `${filePath}.backup-${Date.now()}`);

// Save the updated JSON
try {
  fs.writeFileSync(filePath, JSON.stringify(games, null, 2), "utf-8");
  console.log("games.json successfully migrated to playerXReveal format.");
} catch (err) {
  console.error("Error writing games.json:", err);
  process.exit(1);
}
