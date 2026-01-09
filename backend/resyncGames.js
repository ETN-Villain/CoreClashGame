import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import { RPC_URL, GAME_ADDRESS } from "./config.js";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };

// ✅ ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// adjust path if needed
const DB_FILE = path.join(__dirname, "games", "games.json");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);

const loadGames = () => {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
};

const saveGames = (games) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(games, null, 2));
};

(async () => {
  const localGames = loadGames();
  const existingIds = new Set(localGames.map(g => g.id));

  let id = 0;

  while (true) {
    let g;
    try {
      g = await contract.games(id);
    } catch {
      break; // no more games
    }

    if (!g || g.player1 === ethers.ZeroAddress) {
      break; // end of games
    }

    if (!existingIds.has(id)) {
      localGames.push({
        id,
        player1: g.player1.toLowerCase(),
        player2:
          g.player2 === ethers.ZeroAddress
            ? null
            : g.player2.toLowerCase(),
        stakeToken: g.stakeToken,
        stakeAmount: g.stakeAmount.toString(),
        createdAt: new Date().toISOString(),
        cancelled: Boolean(g.cancelled),
        settled: Boolean(g.settled),
        _reveal: { player1: null, player2: null }
      });

      console.log("Backfilled game", id);
    }

    id++;
  }

  saveGames(localGames);
  console.log(`Resync complete. Total games: ${localGames.length}`);
})();