import express from "express";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { fetchBackgrounds } from "../utils/fetchBackgrounds.js";
import { fileURLToPath } from "url";
import { readGames, writeGames } from "../gamesStore.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- PATHS ----------------
const GAMES_FILE = path.join(process.cwd(), "backend", "games", "games.json");
const REVEAL_DIR = path.join(process.cwd(), "backend", "reveal-backups");
const MAPPING_FILE = path.join(process.cwd(), "backend", "mapping.csv");

// ---------------- ENSURE DIRS ----------------
fs.mkdirSync(path.dirname(GAMES_FILE), { recursive: true });
fs.mkdirSync(REVEAL_DIR, { recursive: true });

// ---------------- HELPERS ----------------
function loadGames() {
  if (!fs.existsSync(GAMES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
}

function loadTokenURIMapping() {
  if (!fs.existsSync(MAPPING_FILE)) return {};
  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const map = {};
  for (const r of records) map[Number(r.token_id)] = r.token_uri;
  return map;
}

// ---------------- VALIDATE TEAM ----------------
router.post("/validate", async (req, res) => {
  try {
    const { nfts } = req.body;
    if (!Array.isArray(nfts) || nfts.length !== 3)
      return res.status(400).json({ error: "Exactly 3 NFTs required" });

    const metadata = await fetchBackgrounds(nfts);
    res.json({ metadata });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --------- CHECK CREATE GAME VALIDITY --------
function validateGamePayload(req, res, next) {
    const { creator, stakeToken, stakeAmount, nfts } = req.body;

    // --- strict validation ---
    if (
      !creator ||
      !stakeToken ||
      !stakeAmount ||
      Number(stakeAmount) <= 0 ||
      !Array.isArray(nfts) ||
      nfts.length !== 3
    ) {
      return res.status(400).json({ error: "Invalid game payload" });
    }

    for (const nft of nfts) {
      if (
        !nft.address ||
        nft.address === ethers.ZeroAddress ||
        nft.tokenId === undefined ||
        nft.tokenId === null
      ) {
        return res.status(400).json({ error: "Invalid NFT data" });
      }
    }

    next();
}

// ⛔ NOTHING written yet — safe to continue

// ---------------- CREATE GAME ----------------
router.post("/", validateGamePayload, (req, res) => {
  try {
    const { creator, stakeToken, stakeAmount, nfts } = req.body;
    if (!creator || !stakeToken || !stakeAmount || !Array.isArray(nfts) || nfts.length !== 3)
      return res.status(400).json({ error: "Invalid payload" });

    const games = loadGames();
    const nextId = games.length ? Math.max(...games.map(g => g.id)) + 1 : 0;

    const tokenURIs = nfts.map(n => loadTokenURIMapping()[Number(n.tokenId)]);
    if (tokenURIs.includes(undefined))
      throw new Error("Missing tokenURI");

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
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- JOIN GAME ----------------
router.post("/:id/join", (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player2, nfts } = req.body;

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.cancelled) return res.status(400).json({ error: "Game cancelled" });
    if (game.player2) return res.status(400).json({ error: "Already joined" });

    const tokenURIs = nfts.map(n => loadTokenURIMapping()[Number(n.tokenId)]);
    if (tokenURIs.includes(undefined))
      throw new Error("Missing tokenURI");

    game.player2 = player2.toLowerCase();
    game._player2 = { tokenURIs };
    game.player2JoinedAt = new Date().toISOString();

    saveGames(games);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------- CANCEL GAME ----------------
router.post("/:id/cancel", (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player } = req.body;

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.player2) return res.status(400).json({ error: "Already joined" });
    if (game.cancelled) return res.status(400).json({ error: "Already cancelled" });
    if (player.toLowerCase() !== game.player1)
      return res.status(403).json({ error: "Only creator can cancel" });

    game.cancelled = true;
    saveGames(games);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- REVEAL ----------------
router.post("/:id/reveal", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player, salt, nftContracts, tokenIds } = req.body;

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.cancelled) return res.status(400).json({ error: "Game cancelled" });

    const nfts = nftContracts.map((a, i) => ({ address: a, tokenId: tokenIds[i] }));
    const metadata = await fetchBackgrounds(nfts);
    const backgrounds = metadata.map(m => m.background);

    game._reveal[player.toLowerCase()] = {
      salt,
      nftContracts,
      tokenIds,
      teamData: metadata,
      backgrounds
    };

    game.revealReady =
      Boolean(game._reveal[game.player1]) &&
      Boolean(game.player2 && game._reveal[game.player2]);

    saveGames(games);

    res.json({ success: true, revealReady: game.revealReady });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Express Endpoint Export
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.add(res);
  req.on("close", () => clients.delete(res));
});

export default router;
// export helper functions for backend use
export { readGames, writeGames };