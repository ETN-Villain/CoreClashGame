import express from "express";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync"; // use named import
import { fetchBackgrounds } from "../utils/fetchBackgrounds.js";
import { autoSettleGame } from "../utils/autoSettleGame.js";

const router = express.Router();
const DIR = path.dirname(new URL(import.meta.url).pathname);
const GAMES_FILE = path.join(DIR, "games.json");
const MAPPING_FILE = path.join(DIR, "mapping.csv");

// ---------------- Helper functions ----------------
const loadGames = () => {
  if (!fs.existsSync(GAMES_FILE)) return [];
  return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
};

const saveGames = (games) => {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
};

const loadTokenURIMapping = () => {
  if (!fs.existsSync(MAPPING_FILE)) return {};
  const csvContent = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });
  const mapping = {};
  for (const r of records) {
    mapping[Number(r.token_id)] = r.token_uri;
  }
  return mapping;
};

/* ---------------- VALIDATE TEAM ---------------- */
// ---------------- VALIDATE TEAM ----------------
router.post("/validate", async (req, res) => {
  try {
    const { nfts } = req.body;

    if (!Array.isArray(nfts) || nfts.length !== 3) {
      return res.status(400).json({ error: "Exactly 3 NFTs required" });
    }

    for (const nft of nfts) {
      if (!nft.address || nft.tokenId == null) {
        return res.status(400).json({ error: "Each NFT must have address and tokenId" });
      }
    }

    // Fetch metadata (mapping.csv is used internally here)
    const metadata = await fetchBackgrounds(nfts);

    // ✅ DO NOT check tokenURI here
    return res.json({ metadata });

  } catch (err) {
    console.error("Validate team failed:", err);
    return res.status(400).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { creator, stakeToken, stakeAmount, nfts } = req.body;

    if (!creator || !stakeToken || !stakeAmount || !Array.isArray(nfts) || nfts.length !== 3) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // Merge tokenURI from CSV
    const metadata = await fetchBackgrounds(nfts);
    const tokenURIMapping = loadTokenURIMapping();
    const teamData = metadata.map((m, i) => {
      const tokenId = Number(nfts[i].tokenId);
      const tokenURI = nfts[i].metadata?.tokenURI || tokenURIMapping[tokenId] || null;
      if (!tokenURI) throw new Error(`NFT ${tokenId} is missing a tokenURI`);
      return { ...m, tokenURI };
    });

    const tokenURIs = teamData.map(m => m.tokenURI);

    const games = loadGames();
    const nextId = games.length > 0 ? Math.max(...games.map(g => g.id)) + 1 : 0;

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
    console.error("Create game failed:", err);
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/join", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player2, nfts } = req.body;

    if (!player2 || !Array.isArray(nfts) || nfts.length !== 3) {
      return res.status(400).json({ error: "Invalid join payload" });
    }

    // Validate NFT shape
    for (const nft of nfts) {
      if (!nft.address || nft.tokenId == null || !nft.metadata) {
        return res.status(400).json({ error: "Malformed NFT object" });
      }
    }

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.player2) return res.status(400).json({ error: "Game already joined" });

    // Merge tokenURI from CSV
    const metadata = await fetchBackgrounds(nfts);
    const tokenURIMapping = loadTokenURIMapping();
    const teamData = metadata.map((m, i) => {
      const tokenId = Number(nfts[i].tokenId);
      const tokenURI = nfts[i].metadata?.tokenURI || tokenURIMapping[tokenId] || null;
      if (!tokenURI) throw new Error(`NFT ${tokenId} is missing a tokenURI`);
      return {
        ...m,
        tokenURI,
        traits: [
          Number(m.attack),
          Number(m.defense),
          Number(m.vitality),
          Number(m.agility),
          Number(m.core)
        ]
      };
    });

    const tokenURIs = teamData.map(m => m.tokenURI);

    game.player2 = player2;
    game.player2JoinedAt = new Date().toISOString();
    game._player2 = { tokenURIs, teamData, revealed: false };

    saveGames(games);

    res.json({ success: true });
  } catch (err) {
    console.error("Join game failed:", err);
    res.status(400).json({ error: err.message });
  }
});

// ---------------- STORE PLAYER REVEAL ----------------
router.post("/:id/reveal", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { player, salt, nftContracts, tokenIds, backgrounds } = req.body;

    if (!player || !salt || !Array.isArray(nftContracts) || !Array.isArray(tokenIds) || !Array.isArray(backgrounds)) {
      return res.status(400).json({ error: "Missing or invalid reveal data" });
    }

    if (nftContracts.length !== 3 || tokenIds.length !== 3 || backgrounds.length !== 3) {
      return res.status(400).json({ error: "Exactly 3 NFTs required for reveal" });
    }

    const games = loadGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    if (!game._reveal) game._reveal = {};

const tokenURIMapping = loadTokenURIMapping();
const metadataWithTokenURI = metadata.map((m, i) => ({
  ...m,
  tokenURI: tokenURIMapping[nfts[i].tokenId] || null  // always get from CSV
}));

const missing = metadataWithTokenURI.filter(m => !m.tokenURI).map(m => m.tokenId);
if (missing.length > 0) {
  return res.status(400).json({ error: `NFTs missing tokenURI: ${missing.join(", ")}` });
}

return res.json({ metadata: metadataWithTokenURI });

    game._reveal[player.toLowerCase()] = {
      salt: salt.toString(),
      nftContracts: nftContracts.map(addr => addr.toString()),
      tokenIds: tokenIds.map(id => id.toString()),
      backgrounds: backgrounds.map(bg => bg.toString()),
      nfts
    };

    const p1Reveal = game._reveal[game.player1?.toLowerCase()];
    const p2Reveal = game._reveal[game.player2?.toLowerCase()];
    if (p1Reveal && p2Reveal) game.revealReady = true;

    saveGames(games);
    res.json({ success: true, revealReady: game.revealReady });
  } catch (err) {
    console.error("Reveal storage failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;