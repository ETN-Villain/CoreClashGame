import express from "express";
import fs from "fs";
import path from "path";
import { fetchBackgrounds } from "../utils/fetchBackgrounds.js";
import { autoSettleGame } from "../utils/autoSettleGame.js";
import { fileURLToPath } from "url";

// Inside your router file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVEAL_DIR = path.join(__dirname, "reveal-backups");
if (!fs.existsSync(REVEAL_DIR)) fs.mkdirSync(REVEAL_DIR, { recursive: true });

const router = express.Router();
const GAMES_FILE = path.join(new URL("..", import.meta.url).pathname, "games.json");

// Helper functions
const loadGames = () => {
  if (!fs.existsSync(GAMES_FILE)) return [];
  return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
};

const saveGames = (games) => {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
};

/* ---------------- VALIDATE TEAM ---------------- */
router.post("/validate", async (req, res) => {
  try {
    const { nfts } = req.body;

    console.log("Validate payload received:", nfts);

    if (!Array.isArray(nfts) || nfts.length === 0) {
      return res.status(400).json({ error: "NFT array is empty or invalid" });
    }

    // Ensure each NFT has address and tokenId
    for (const nft of nfts) {
      if (!nft.address || !nft.tokenId) {
        return res.status(400).json({ error: "Each NFT must have address and tokenId" });
      }
    }

    // Fetch metadata for all NFTs
    const metadata = await fetchBackgrounds(nfts);

    console.log("Validation result:", metadata);

    return res.json({ metadata });

  } catch (err) {
    console.error("Validation error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/* ---------------- CREATE GAME ---------------- */
router.post("/", async (req, res) => {
  try {
    const { creator, stakeToken, stakeAmount, tokenURIs } = req.body;

    if (!creator || !stakeToken || !stakeAmount || !Array.isArray(tokenURIs)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    if (tokenURIs.length !== 3) return res.status(400).json({ error: "Exactly 3 NFTs required" });

    const teamData = await fetchBackgrounds(tokenURIs);

    const games = loadGames();
    const nextId = games.length > 0 ? Math.max(...games.map((g) => g.id)) + 1 : 0;

    const newGame = {
      id: nextId,
      creator,
      stakeToken,
      stakeAmount,
      player1: creator,
      player2: null,
      createdAt: new Date().toISOString(),
      player2JoinedAt: null,
      settledAt: null,
      winner: null,
      tie: false,
      revealReady: false,
      _player1: { tokenURIs, teamData },
      _player2: null
    };

    games.push(newGame);
    saveGames(games);

    res.status(201).json({ success: true, gameId: nextId });
  } catch (err) {
    console.error("Create game failed:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/* ---------------- JOIN & AUTO-SETTLE ---------------- */
router.post("/:id/join", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player2, tokenURIs } = req.body;

    if (!player2 || !Array.isArray(tokenURIs) || tokenURIs.length !== 3) {
      return res.status(400).json({ error: "Invalid join payload" });
    }

    const games = loadGames();
    const game = games.find((g) => g.id === gameId);

    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.player2) return res.status(400).json({ error: "Already joined" });

    // Fetch metadata for Player 2
    const metadata = await fetchBackgrounds(tokenURIs);

    const traits = metadata.map(m => [
      Number(m.attack),
      Number(m.defense),
      Number(m.vitality),
      Number(m.agility),
      Number(m.core),
    ]);

    if (traits.some(t => t.some(Number.isNaN))) {
      return res.status(400).json({ error: "Invalid traits detected" });
    }

    game.player2 = player2;
    game.player2JoinedAt = new Date().toISOString();
    game._player2 = { tokenURIs, traits };

    game._settling = true;
    saveGames(games);

    await autoSettleGame(game); // ✅ uses authoritative slot-based traits

    game._settling = false;
    saveGames(games);

    res.json({ success: true, settled: true, winner: game.winner, tie: game.tie });
  } catch (err) {
    console.error("Join & settle failed:", err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post("/reveal-backup", async (req, res) => {
  try {
    const { gameId, player, salt, nftContracts, tokenIds, backgrounds } = req.body;

    if (
      gameId === undefined ||
      !player ||
      !salt ||
      !Array.isArray(nftContracts) ||
      !Array.isArray(tokenIds) ||
      !Array.isArray(backgrounds) ||
      nftContracts.length !== 3 ||
      tokenIds.length !== 3 ||
      backgrounds.length !== 3
    ) {
      return res.status(400).json({ error: "Invalid reveal backup payload" });
    }

    const metadata = await fetchBackgrounds(
        tokenIds.map(id => ({ tokenId: id }))
    );

const traits = metadata.map(m => m.traits);

    // Correct Windows-compatible path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const REVEAL_DIR = path.join(__dirname, "reveal-backups");
    if (!fs.existsSync(REVEAL_DIR)) fs.mkdirSync(REVEAL_DIR, { recursive: true });

    const filename = `game-${gameId}-${player}.json`;
    const filepath = path.join(REVEAL_DIR, filename);

    fs.writeFileSync(
      filepath,
      JSON.stringify({ gameId, player, salt, nftContracts, tokenIds, backgrounds }, null, 2)
    );

    console.log(`Reveal backup saved: ${filename}`);
    res.json({ success: true, file: filename });
  } catch (err) {
    console.error("Save reveal backup failed:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

export default router;
