import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import GameABI from "../../src/abis/GameABI.json" assert { type: "json" };
import { GAME_ADDRESS, RPC_URL } from "../config.js";

const GAMES_FILE = path.join(process.cwd(), "games", "games.json");
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);

async function main() {
  let games = [];
  if (fs.existsSync(GAMES_FILE)) {
    games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
  }

  const existingIds = new Set(games.map(g => g.id));

  const currentOnChainId = await contract.nextGameId(); // assumes your contract has a nextGameId counter
  console.log("On-chain next game ID:", currentOnChainId.toString());

  for (let i = 0; i < currentOnChainId; i++) {
    if (existingIds.has(i)) continue; // skip already in JSON

    try {
      const g = await contract.games(i);

      // only create entries for existing (player1 filled) games
      if (g.player1 === ethers.ZeroAddress) {
        console.log(`Skipping game ${i} (not created on-chain yet)`);
        continue;
      }

      const newGame = {
        id: i,
        player1: g.player1,
        player2: g.player2,
        stakeAmount: g.stakeAmount.toString(),
        stakeToken: g.stakeToken,
        settled: g.settled,
        winner: g.winner || null,
        player1Revealed: g.player1Revealed,
        player2Revealed: g.player2Revealed,
      };

      games.push(newGame);
      console.log(`Backfilled game ${i}`);
    } catch (err) {
      console.error(`Failed to fetch game ${i}:`, err.message);
    }
  }

  // Sort by ID just in case
  games.sort((a, b) => a.id - b.id);

  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
  console.log("✅ Backfill complete. Total games:", games.length);
}

main().catch(err => console.error(err));
