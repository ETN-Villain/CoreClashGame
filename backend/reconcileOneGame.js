// reconcileOneGame.js — run with `node reconcileOneGame.js`
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import { RPC_URL, BACKEND_PRIVATE_KEY, GAME_ADDRESS } from "./config.js";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to games.json
const GAMES_FILE = path.join(__dirname, "games", "games.json");

// Load games.json
const games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));

// Game ID to reconcile
const gameId = 4;

(async () => {
  try {
    const game = games.find(g => g.id === gameId);
    if (!game) throw new Error("Game not found");

    console.log("Before reconcile:", {
      cancelled: game.cancelled,
      settled: game.settled,
      settledAt: game.settledAt,
    });

    // Connect to contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    // Fetch on-chain game
    const onChainGame = await contract.games(gameId);

    // Only update if on-chain shows it was cancelled
    if (onChainGame.settled && !game.cancelled) {
      game.cancelled = true;
      game.settled = true;
      game.settledAt = new Date().toISOString();
      game.settleTxHash = onChainGame.txHash || "on-chain-cancel";

      // Save back to disk
      fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), "utf8");

      console.log("✅ Game reconciled to on-chain state:", {
        cancelled: game.cancelled,
        settled: game.settled,
        settledAt: game.settledAt,
      });
    } else {
      console.log("No update needed; backend already matches on-chain");
    }
  } catch (err) {
    console.error("Reconcile failed:", err);
  }
})();
