import path from "path";
import fs from "fs";
import { autoSettleGame } from "../backend/utils/autoSettleGame.js";
import { METADATA_JSON_DIR, MAPPING_FILE } from "../backend/paths.js";

console.log({ METADATA_JSON_DIR, MAPPING_FILE }); // <--- debug line

/* ---------------- LOAD MAPPING ---------------- */
export function loadMapping() {
  if (!fs.existsSync(MAPPING_FILE)) {
    throw new Error("mapping.csv not found – run generateMapping first");
  }

  const mapping = {};
  const lines = fs.readFileSync(MAPPING_FILE, "utf8")
    .split(/\r?\n/)   // handles Windows or Unix line endings
    .slice(1);         // skip header

  for (const line of lines) {
    if (!line.trim()) continue;

    const [tokenIdRaw, tokenUriRaw] = line.split(",");
    if (!tokenIdRaw || !tokenUriRaw) {
      console.warn("Skipping invalid CSV line:", line);
      continue;
    }

    const tokenId = tokenIdRaw.trim();
    const tokenUri = tokenUriRaw.trim();

    // Build full file path
    const filePath = path.join(METADATA_JSON_DIR, tokenUri);

    mapping[tokenId] = filePath;
  }

  console.log("✅ Mapping loaded:", mapping);
  return mapping;
}

/* ---------------- LOAD LOCAL METADATA ---------------- */
function loadLocalMetadata(tokenId, mapping) {
  const filePath = mapping[tokenId];
  if (!filePath) {
    throw new Error(`No mapping entry for tokenId ${tokenId}`);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Metadata file missing: ${filePath}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  // Normalize OpenSea-style attributes
  const attr = {};
  if (Array.isArray(data.attributes)) {
    for (const a of data.attributes) {
      attr[a.trait_type.toLowerCase()] = a.value;
    }
  }

  return {
    name: data.name || `Token ${tokenId}`,
    background: attr.background || "Unknown",
    attack: Number(attr.attack) || 0,
    defense: Number(attr.defense) || 0,
    vitality: Number(attr.vitality) || 0,
    agility: Number(attr.agility) || 0,
    core: Number(attr.core ?? attr.CORE) || 0
  };
}

/* ---------------- EXTRACT TRAITS ---------------- */
function parseTraits(metadata) {
  return {
    attack: metadata.attack,
    defense: metadata.defense,
    vitality: metadata.vitality,
    agility: metadata.agility,
    core: metadata.core
  };
}

/* ---------------- HARDCODED TEST DATA ---------------- */
const NFT_CONTRACT = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";

const player1NFTs = ["59", "395", "468"];
const player2NFTs = ["425", "421", "416"];

/* ---------------- RUN SIMULATION ---------------- */
async function run() {
  console.log("🚀 Starting OFFLINE game simulation\n");

// Load mapping
const mapping = loadMapping();

// Load metadata for players
const p1Traits = player1NFTs.map(tokenId => {
  const meta = loadLocalMetadata(tokenId, mapping);
  return {
    tokenId,
    background: meta.background,
    traits: {
      attack: meta.attack,
      defense: meta.defense,
      vitality: meta.vitality,
      agility: meta.agility,
      core: meta.core
    }
  };
});

const p2Traits = player2NFTs.map(tokenId => {
  const meta = loadLocalMetadata(tokenId, mapping);
  return {
    tokenId,
    background: meta.background,
    traits: {
      attack: meta.attack,
      defense: meta.defense,
      vitality: meta.vitality,
      agility: meta.agility,
      core: meta.core
    }
  };
});

// Build game object
const game = {
  id: 999999,
  player1: "0xPLAYER1",
  player2: "0xPLAYER2",
  settled: false,

_player1: {
  tokenIds: player1NFTs.map(String)
},
_player2: {
  tokenIds: player2NFTs.map(String)
}
};

  console.log("🟥 Player 1 Traits");
  console.table(game._player1.traits);

  console.log("🟦 Player 2 Traits");
  console.table(game._player2.traits);

  await autoSettleGame(game);

  console.log("\n🏁 FINAL RESULT");
  console.log({
    winner: game.winner ?? "DRAW",
    tie: game.tie
  });

console.log("\n📊 ROUND RESULTS");
if (game.roundResults) {
  console.table(
    game.roundResults.map(r => ({
      round: r.round,
      p1: r.p1Total,
      p2: r.p2Total,
      diff: r.diff,
      winner: r.winner
    }))
  );
} else {
  console.log("No per-round results available. Only total winner is computed.");
}
}

/* ---------------- EXECUTE ---------------- */
run().catch(err => {
  console.error("❌ Simulation failed:", err.message);
  process.exit(1);
});
