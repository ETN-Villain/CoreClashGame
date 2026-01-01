import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import axios from "axios";

/**
 * CONFIG
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const RARE_BACKGROUNDS = ["Gold", "Silver", "Verdant Green", "Rose Gold"];
const MAPPING_FILE = path.join(__dirname, "..", "mapping.csv");
const METADATA_ROOT = "QmZMPmh6qg31NqH5tFKoQ5k3uMDBNMxkQUS7tyqCZstUNv";
/**
 * tokenId -> token_uri map
 */
const tokenMap = new Map();

/**
 * Load CSV mapping once at startup
 */
export async function loadMapping() {
  if (tokenMap.size > 0) return;

  return new Promise((resolve, reject) => {
    fs.createReadStream(MAPPING_FILE)
      .pipe(csv({ headers: ["token_id", "token_uri"], skipLines: 0 }))
      .on("data", (row) => {
        // Trim values to avoid whitespace issues
        const tokenId = String(row.token_id).trim();
        const tokenURI = row.token_uri.trim();
        tokenMap.set(tokenId, tokenURI);
      })
      .on("end", () => {
        console.log(`Loaded ${tokenMap.size} token mappings`);
        resolve();
      })
      .on("error", reject);
  });
}

/**
 * Fetch metadata JSON from IPFS
 */
async function fetchMetadata(tokenId) {
  const tokenURI = tokenMap.get(String(tokenId));

  if (!tokenURI) {
    throw new Error(`Missing tokenURI for tokenId ${tokenId}`);
  }

  const url = `${IPFS_GATEWAY}${METADATA_ROOT}/${tokenURI}`;
  const res = await axios.get(url, { timeout: 10000 });
  const data = res.data;

  const attr = {};
  if (Array.isArray(data.attributes)) {
    for (const a of data.attributes) {
      attr[a.trait_type.toLowerCase()] = a.value;
    }
  }

  return {
    name: data.name || `Token ${tokenId}`,
    background: attr.background || "Unknown",
    attack: attr.attack ?? 0,
    defense: attr.defense ?? 0,
    vitality: attr.vitality ?? 0,
    agility: attr.agility ?? 0,
    core: attr.core ?? 0,
    tokenURI // ✅ KEEP IT
  };
}

/**
 * MAIN ENTRY
 * tokenURIs = [
 *   { address: "0x...", tokenId: "123" },
 *   ...
 * ]
 */
export async function fetchBackgrounds(tokenURIs) {
  if (!Array.isArray(tokenURIs) || tokenURIs.length === 0) {
    throw new Error("NFT array is empty or invalid");
  }

  await loadMapping();

  const metadataList = [];
  const names = new Set();
  const backgrounds = [];

  for (const nft of tokenURIs) {
    if (!nft.tokenId || !nft.address) throw new Error("NFT must have address and tokenId");

    const meta = await fetchMetadata(nft.tokenId);

    // Ensure name/background exist
    meta.name = meta.name || `Token ${nft.tokenId}`;
    meta.background = meta.background || "Unknown";

    if (names.has(meta.name)) {
      throw new Error(`Duplicate character: ${meta.name}`);
    }
    names.add(meta.name);

metadataList.push({
  name: meta.name,
  background: meta.background,
  address: nft.address,
  tokenId: Number(nft.tokenId),
  tokenURI: meta.tokenURI, // ✅ ADD THIS
  traits: [
    meta.attack,
    meta.defense,
    meta.vitality,
    meta.agility,
    meta.core
  ]
});

    backgrounds.push(meta.background);
  }

  // Rare background duplication rule
  const rareCount = {};
  for (const bg of backgrounds) {
    if (RARE_BACKGROUNDS.includes(bg)) {
      rareCount[bg] = (rareCount[bg] || 0) + 1;
      if (rareCount[bg] > 1) {
        throw new Error(`Rare background duplicated: ${bg}`);
      }
    }
  }

  return metadataList;
}
