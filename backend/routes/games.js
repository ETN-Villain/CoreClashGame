import express from "express";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ethers } from "ethers";
import { fileURLToPath } from "url";
import { METADATA_JSON_DIR, REVEAL_DIR, MAPPING_FILE, loadMapping } from "../paths.js";
import { RPC_URL, BACKEND_PRIVATE_KEY, GAME_ADDRESS } from "../config.js";
import { loadGames, saveGames, resolveGame } from "../gameLogic.js";
import GameABI from "../../src/abis/GameABI.json" assert { type: "json" };

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

const GAMES_FILE = path.join(__dirname, "..", "games", "games.json");
fs.mkdirSync(path.dirname(GAMES_FILE), { recursive: true });
fs.mkdirSync(REVEAL_DIR, { recursive: true });

// ---------------- HELPERS ----------------
function loadTokenURIMapping() {
  if (!fs.existsSync(MAPPING_FILE)) return {};
  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const map = {};
  for (const r of records) map[Number(r.token_id)] = r.token_uri;
  return map;
}

// ---------------- CREATE GAME ----------------
router.post("/", (req, res) => {
  const { creator, stakeToken, stakeAmount, nfts } = req.body;
  if (!creator || !stakeToken || !stakeAmount || !Array.isArray(nfts) || nfts.length !== 3)
    return res.status(400).json({ error: "Invalid payload" });

  const games = loadGames();
  const nextId = games.length ? Math.max(...games.map(g => g.id)) + 1 : 0;
  const tokenURIs = nfts.map(n => loadTokenURIMapping()[Number(n.tokenId)]);
  if (tokenURIs.includes(undefined)) return res.status(400).json({ error: "Missing tokenURI" });

  games.push({
    id: nextId,
    player1: creator.toLowerCase(),
    player2: null,
    stakeToken,
    stakeAmount,
    createdAt: new Date().toISOString(),
    cancelled: false,
    revealReady: false,
    winner: null,
    _player1: { tokenURIs },
    _player2: null,
    _reveal: {}
  });

  saveGames(games);
  res.json({ success: true, gameId: nextId });
});

// ---------------- JOIN GAME ----------------
router.post("/:id/join", (req, res) => {
  const gameId = Number(req.params.id);
  const { player2, nfts } = req.body;

  const games = loadGames();
  const game = games.find(g => g.id === gameId);
  if (!game) return res.status(404).json({ error: "Game not found" });

  if (game.player2) return res.json({ success: true, alreadyJoined: true });
  if (game.cancelled) return res.status(400).json({ error: "Game cancelled" });

  const tokenURIs = nfts.map(n => loadTokenURIMapping()[Number(n.tokenId)]);
  if (tokenURIs.includes(undefined)) return res.status(400).json({ error: "Missing tokenURI" });

  game.player2 = player2.toLowerCase();
  game._player2 = { tokenURIs };
  game.player2JoinedAt = new Date().toISOString();

  saveGames(games);
  res.json({ success: true });
});

// ---------------- REVEAL GAME ----------------
console.log("✅ reveal route registered");
router.post("/:id/reveal", (req, res) => {
  try {
    const gameId = Number(req.params.id);
    console.log("Reveal request received", { gameId, body: req.body });

    const { player, salt, nftContracts, tokenIds } = req.body;
    if (!player || !salt || !nftContracts || !tokenIds) return res.status(400).json({ error: "Missing reveal data" });

    const games = loadGames();
    console.log("Loaded games IDs:", games.map(g => g.id));

    const game = games.find(g => g.id === gameId);
    if (!game) {
      console.log("Game not found!");
      return res.status(404).json({ error: "Game not found" });
    }

    const playerLc = player.toLowerCase();
    let slot;
    if (game.player1 === playerLc) slot = "player1";
    else if (game.player2 === playerLc) slot = "player2";
    else return res.status(403).json({ error: "Not a game participant" });

    game._reveal ??= {};
    if (game._reveal[slot]) return res.status(400).json({ error: "Reveal already submitted" });

    const mapping = loadMapping();
    const tokenURIs = tokenIds.map(id => mapping[Number(id)]);
    if (tokenURIs.some(u => !u)) throw new Error("Missing tokenURI");

    game._reveal[slot] = { salt, nftContracts, tokenIds, tokenURIs };
    saveGames(games);

    const backgrounds = tokenIds.map(id => {
      const file = mapping[Number(id)];
      const json = JSON.parse(fs.readFileSync(path.join(METADATA_JSON_DIR, file)));
      const bg = json.attributes.find(a => a.trait_type === "Background");
      return bg?.value ?? "Unknown";
    });

    res.json({ savedReveal: { salt, nftContracts, tokenIds, backgrounds } });
  } catch (err) {
    console.error("Reveal error:", err);
    res.status(400).json({ error: err.message });
  }

  game.player1Revealed = !!game._reveal.player1;
  game.player2Revealed = !!game._reveal.player2;

  saveGames(games);

});

/* ---------------- POST WINNER ---------------- */
router.post("/:id/post-winner", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
console.log("Game ID:", gameId);
    if (isNaN(gameId)) return res.status(400).json({ error: "Invalid game ID" });

    // Load games and find the one we want
    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    // Require both reveals
    if (!game._reveal?.player1 || !game._reveal?.player2) {
      return res.status(400).json({ error: "Both players must reveal" });
    }

    // Resolve winner using gameLogic
    const resolved = await resolveGame(game);
    if (!resolved) return res.status(400).json({ error: "Game could not be resolved" });

    // Determine Solidity-compatible winner
    let winnerAddress = ethers.ZeroAddress; // tie by default
    if (!resolved.tie && resolved.winner) {
      // normalize winner address to match exactly one of the on-chain players
      const winnerLc = resolved.winner.toLowerCase();
      if (winnerLc === game.player1.toLowerCase()) winnerAddress = game.player1;
      else if (winnerLc === game.player2.toLowerCase()) winnerAddress = game.player2;
      else {
        // fallback: tie if winner is somehow invalid
        console.warn("Resolved winner does not match any player, defaulting to tie");
        winnerAddress = ethers.ZeroAddress;
console.log("Player1:", game.player1);
console.log("Player2:", game.player2);
      }
    }

    console.log("Posting winner:", { gameId, winnerAddress, player1: game.player1, player2: game.player2 });

    // ------------------ Setup provider and wallet ------------------
    if (!BACKEND_PRIVATE_KEY.startsWith("0x")) {
      throw new Error("Backend private key must start with 0x");
    }
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);

    // ------------------ Connect to contract ------------------
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    // ------------------ Call postWinner on-chain ------------------
    const tx = await contract.postWinner(gameId, winnerAddress);
    await tx.wait();

    // ------------------ Persist locally ------------------
    game.backendWinner = winnerAddress;
    saveGames(games);

    // ------------------ Response ------------------
    res.json({
      success: true,
      gameId,
      winner: winnerAddress,
      tie: resolved.tie
    });

  } catch (err) {
    console.error("post-winner error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- CANCEL GAME ----------------
router.post("/:id/cancel", (req, res) => {
  const gameId = Number(req.params.id);
  const { player } = req.body;

  const games = loadGames();
  const game = games.find(g => g.id === gameId);
  if (!game) return res.status(404).json({ error: "Game not found" });
  if (game.player2) return res.status(400).json({ error: "Already joined" });
  if (game.cancelled) return res.status(400).json({ error: "Already cancelled" });
  if (player.toLowerCase() !== game.player1) return res.status(403).json({ error: "Only creator can cancel" });

  game.cancelled = true;
  saveGames(games);
  res.json({ success: true });
});

export default router;