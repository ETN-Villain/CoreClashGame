// syncGames.js
import fs from "fs";
import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import { GAME_ADDRESS, RPC_URL } from "./config.js";

// ---------------- CONFIG ----------------
const SYNC_PATH = "./games/syncgames.json";
const GAMES_PATH = "./games/games.json";

// ---------------- PROVIDER ----------------
const provider = new ethers.JsonRpcProvider(RPC_URL);
const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);

async function main() {
  try {
    const length = await gameContract.gamesLength();
    console.log("On-chain games length:", length.toString());

    const games = [];
    for (let i = 0; i < Number(length); i++) {
      const g = await gameContract.games(i);
      const backendWinner = await gameContract.backendWinner(i);

games.push({
  id: i,
  player1: g.player1,
  player2: g.player2,
  stakeAmount: g.stakeAmount.toString(),
  player1Revealed: g.player1Revealed,
  player2Revealed: g.player2Revealed,
  settled: g.settled,
  winner: g.winner,
  backendWinner: backendWinner,
  player1TokenIds: (g.player1TokenIds || []).map(t => t.toString()),
  player2TokenIds: (g.player2TokenIds || []).map(t => t.toString()),
  player1Backgrounds: g.player1Backgrounds || [],
  player2Backgrounds: g.player2Backgrounds || [],
  roundResults: g.roundResults || [],
  cancelled: g.cancelled || false
});
    }

    // ---------------- WRITE syncgames.json ----------------
    fs.writeFileSync(SYNC_PATH, JSON.stringify(games, null, 2));
    console.log(`✅ Synced ${games.length} games to ${SYNC_PATH}`);

    // ---------------- OVERWRITE games.json ----------------
    fs.writeFileSync(GAMES_PATH, JSON.stringify(games, null, 2));
    console.log(`✅ Updated frontend backend games.json`);
  } catch (err) {
    console.error("Sync failed:", err);
  }
}

main();
