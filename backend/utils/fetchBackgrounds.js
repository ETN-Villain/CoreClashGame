import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { METADATA_JSON_DIR, MAPPING_FILE } from "../paths.js";
import { RARE_BACKGROUNDS } from "exportRareBackgrounds.js";

const tokenMap = new Map();

/**
 * Load mapping.csv once
 */
export async function loadMapping() {
  if (tokenMap.size > 0) return;

  if (!fs.existsSync(MAPPING_FILE)) {
    throw new Error("mapping.csv not found – run generateMapping first");
  }

  return new Promise((resolve, reject) => {
    fs.createReadStream(MAPPING_FILE)
      .pipe(csv({ headers: ["token_id", "token_uri"], skipLines: 1 }))
      .on("data", (row) => {
        const tokenId = String(row.token_id).trim();
        const jsonFile = String(row.token_uri).trim();
        if (tokenId && jsonFile && jsonFile !== "ERROR") {
          tokenMap.set(tokenId, jsonFile);
        }
      })
      .on("end", () => {
        console.log(`Loaded ${tokenMap.size} token mappings`);
        resolve();
      })
      .on("error", reject);
  });
}

/**
 * Load metadata JSON from local cache
 */
async function fetchMetadata(tokenId) {
  await loadMapping();

  const jsonFile = tokenMap.get(String(tokenId));
  if (!jsonFile) throw new Error(`Missing tokenURI mapping for tokenId ${tokenId}`);

  const filePath = path.join(METADATA_JSON_DIR, jsonFile);
  if (!fs.existsSync(filePath)) throw new Error(`Metadata file missing: ${jsonFile}`);

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

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
    tokenURI: jsonFile // keep the mapped file name as tokenURI
  };
}

/**
 * MAIN ENTRY
 * @param {Array<{tokenId: number|string, address?: string}>} nfts
 */
export async function fetchBackgrounds(nfts) {
  const metadataList = [];
  const names = new Set();
  const backgrounds = [];

  for (const nft of nfts) {
    if (!nft.tokenId || !nft.address) {
      throw new Error("NFT must have address and tokenId");
    }

    const meta = await fetchMetadata(nft.tokenId);

    if (names.has(meta.name)) {
      throw new Error(`Duplicate character detected: ${meta.name}`);
    }
    names.add(meta.name);

    metadataList.push({
      name: meta.name,
      background: meta.background,
      address: nft.address,
      tokenId: Number(nft.tokenId),
      tokenURI: meta.tokenURI,
      traits: [meta.attack, meta.defense, meta.vitality, meta.agility, meta.core]
    });

    backgrounds.push(meta.background);
  }

  // Rare background rule
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
