import express from "express";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { ethers } from "ethers";
import { fileURLToPath } from "url";
import { METADATA_JSON_DIR, REVEAL_DIR, MAPPING_FILE, loadMapping } from "../paths.js";
import { RPC_URL, BACKEND_PRIVATE_KEY, GAME_ADDRESS, 
  VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "../config.js";
import GameABI from "../../src/abis/GameABI.json" assert { type: "json" };
import { loadGames, saveGames, resolveGame } from "../gameLogic.js";
import { fetchOwnedTokenIds } from "../utils/nftUtils.js";
import { readOwnerCache, writeOwnerCache } from "../utils/ownerCache.js";  // adjust path if needed

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_URI_MAP = loadTokenURIMapping();

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

// ---------------- HELPERS ----------------
function loadTokenURIMapping() {
  if (!fs.existsSync(MAPPING_FILE)) return {};
  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const map = {};
  for (const r of records) map[Number(r.token_id)] = r.token_uri;
  return map;
}

/* ---------- CREATE GAME ROUTE--------*/
router.post("/", async (req, res) => {
  console.log("🔥 CREATE GAME HIT", req.body);

  const { gameId, creator, stakeToken, stakeAmount } = req.body;

  if (!creator || !stakeToken || !stakeAmount)
    return res.status(400).json({ error: "Invalid payload" });

  if (typeof gameId !== "number")
    return res.status(400).json({ error: "gameId required" });

  const games = loadGames();

  if (games.some(g => g.id === gameId))
    return res.status(409).json({ error: "Game already exists" });

  const player1Lc = creator.toLowerCase();

  games.push({
    id: gameId,
    player1: player1Lc,
    player2: null,
    stakeToken,
    stakeAmount,
    createdAt: new Date().toISOString(),
    cancelled: false,
    winner: null,
    tie: false,
    _reveal: {
      player1: null,
      player2: null
    }
  });

  saveGames(games);
  console.log("✅ Game created:", gameId);

  // Populate ownership cache for creator (Player 1)
  const cache = readOwnerCache();

  if (!cache[player1Lc]) {
    console.log(`Populating initial ownership cache for creator ${player1Lc}`);

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const vkin = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);
      const vqle = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLE_ABI, provider);

      console.log("Fetching VKIN tokens...");
      const vkinIds = await fetchOwnedTokenIds(vkin, player1Lc, "VKIN");

      console.log("Fetching VQLE tokens...");
      const vqleIds = await fetchOwnedTokenIds(vqle, player1Lc, "VQLE");

      cache[player1Lc] = {
        VKIN: vkinIds,
        VQLE: vqleIds,
      };

      writeOwnerCache(cache);
      console.log(`Cache populated for ${player1Lc}: ${vkinIds.length} VKIN, ${vqleIds.length} VQLE`);
    } catch (err) {
      console.error("Failed to populate creator cache:", err.message, err.stack);
    }
  }

  res.json({ success: true, gameId });
});

  // ---------------- JOIN GAME ----------------
router.post("/:id/join", (req, res) => {
  console.log("🔥 JOIN GAME HIT", req.params, req.body);

  const gameId = Number(req.params.id);
  const { player2 } = req.body;

  if (!Number.isInteger(gameId) || !player2) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const games = loadGames();
  const game = games.find(g => g.id === gameId);

  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  if (game.player2) {
    return res.status(409).json({ error: "Game already joined" });
  }

  if (game.player1 === player2.toLowerCase()) {
    return res.status(403).json({ error: "Creator cannot join own game" });
  }

  game.player2 = player2.toLowerCase();
  game.player2JoinedAt = new Date().toISOString();

  saveGames(games);

  console.log("✅ Game joined:", gameId);
  res.json({ success: true });
});

router.post("/:id/reveal", (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player, salt, nftContracts, tokenIds } = req.body;

    if (!player || !salt || !Array.isArray(nftContracts) || !Array.isArray(tokenIds)) {
      return res.status(400).json({ error: "Missing reveal data" });
    }

    if (nftContracts.length !== tokenIds.length) {
      return res.status(400).json({ error: "nftContracts and tokenIds length mismatch" });
    }

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const playerLc = player.toLowerCase();
    let slot;
    if (game.player1 === playerLc) slot = "player1";
    else if (game.player2 === playerLc) slot = "player2";
    else return res.status(403).json({ error: "Not a game participant" });

    game._reveal ??= {};
    if (game._reveal[slot]) {
      return res.status(400).json({ error: "Reveal already submitted" });
    }

    // ---- Map addresses to collection folders ----
    const addressToCollection = {
      [VKIN_CONTRACT_ADDRESS.toLowerCase()]: "VKIN",
      [VQLE_CONTRACT_ADDRESS.toLowerCase()]: "VQLE",
    };

    const mapping = loadMapping(); // your current loadMapping() function

const tokenURIs = [];
const backgrounds = [];

for (let i = 0; i < tokenIds.length; i++) {
  const contractAddr = nftContracts[i].toLowerCase();
  const collection = addressToCollection[contractAddr];

  if (!collection) {
    return res.status(400).json({ error: `Unknown contract: ${contractAddr}` });
  }

  const tokenId = String(tokenIds[i]);

  const mapped = mapping[collection]?.[tokenId];
  if (!mapped) {
    return res.status(400).json({ error: `Missing mapping for ${collection} token ${tokenId}` });
  }

  const jsonFile = mapped.token_uri || `${tokenId}.json`;

  // Declare jsonPath inside loop — only used here
  const jsonPath = path.join(METADATA_JSON_DIR, collection, jsonFile);

  if (!fs.existsSync(jsonPath)) {
    return res.status(500).json({ error: `Metadata missing: ${jsonPath}` });
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  const bgTrait = jsonData.attributes?.find(a => a.trait_type === "Background");
  const background = bgTrait?.value || "Unknown";

  tokenURIs.push(jsonFile);
  backgrounds.push(background);
}

// When saving
game._reveal[slot] = {
  salt,
  nftContracts: [...nftContracts], // make a copy to be safe
  tokenIds: [...tokenIds],
  tokenURIs,
  backgrounds,
};

    game.player1Revealed = !!game._reveal.player1;
    game.player2Revealed = !!game._reveal.player2;

    saveGames(games);

    return res.json({
      savedReveal: {
        salt,
        nftContracts,
        tokenIds,
        tokenURIs,
        backgrounds,
      },
    });

  } catch (err) {
    console.error("Reveal error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ---------------- POST WINNER ---------------- */
router.post("/:id/post-winner", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    // 🔒 Idempotency guard
    if (game.backendWinner) {
      return res.json({
        success: true,
        gameId,
        winner: game.backendWinner,
        alreadyPosted: true,
      });
    }

    // 🔒 Require both reveals
    if (!game._reveal?.player1 || !game._reveal?.player2) {
      return res.status(400).json({ error: "Both players must reveal" });
    }

    // 🎯 Resolve game
    const resolved = await resolveGame(game);
    if (!resolved) {
      return res.status(400).json({ error: "Game could not be resolved" });
    }

    // 🧠 Determine Solidity-compatible winner
    let winnerAddress = ethers.ZeroAddress;

    if (!resolved.tie && resolved.winner) {
      const winnerLc = resolved.winner.toLowerCase();

      if (winnerLc === game.player1.toLowerCase()) {
        winnerAddress = game.player1;
      } else if (winnerLc === game.player2.toLowerCase()) {
        winnerAddress = game.player2;
      }
    }

    console.log("Posting winner:", {
      gameId,
      winnerAddress,
      player1: game.player1,
      player2: game.player2,
    });

    // ⛓️ Post on-chain
    const tx = await contract.postWinner(gameId, winnerAddress);
    await tx.wait();

    // 💾 Persist canonical backend state
    game.backendWinner = winnerAddress;
    game.tie = resolved.tie;
    game.player1Revealed = true;
    game.player2Revealed = true;
    game.winnerResolvedAt = new Date().toISOString();

    res.json({
      success: true,
      gameId,
      winner: winnerAddress,
      tie: resolved.tie,
    });

  } catch (err) {
    console.error("post-winner error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------- FINALIZE SETTLE ---------------- */
router.post("/:id/finalize-settle", (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: "Missing txHash" });
    }

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    if (game.settled) {
      return res.json({ success: true, alreadySettled: true });
    }

    if (!game.backendWinner && !game.tie) {
      return res.status(400).json({ error: "Winner not posted yet" });
    }

    // ✅ Canonical settlement
    game.settled = true;
    game.settleTxHash = txHash;
    game.settledAt = new Date().toISOString();
    game.winner = game.backendWinner ?? ethers.ZeroAddress;

    saveGames(games);

    res.json({
      success: true,
      gameId,
      txHash,
    });

  } catch (err) {
    console.error("finalize-settle error:", err);
    res.status(500).json({ error: err.message });
  }
});

    // ------------------ Setup provider and wallet ------------------
    if (!BACKEND_PRIVATE_KEY.startsWith("0x")) {
      throw new Error("Backend private key must start with 0x");
    }

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