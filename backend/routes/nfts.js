import express from "express";
const router = express.Router();

import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import { readOwnerCache, writeOwnerCache } from "../utils/ownerCache.js";
import mapping from "../../src/mapping.json" assert { type: "json" }; // new format
import { RPC_URL, VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "../config.js";
import { METADATA_JSON_DIR } from "../paths.js";
import { fetchOwnedTokenIds } from "../utils/nftUtils.js";
import VKIN_ABI from "../../src/abis/VKINABI.json" assert { type: "json" };
import VQLE_ABI from "../../src/abis/VQLEABI.json" assert { type: "json" };

const delay = ms => new Promise(r => setTimeout(r, ms));

const addressToCollection = {
  [VKIN_CONTRACT_ADDRESS.toLowerCase()]: "VKIN",
  [VQLE_CONTRACT_ADDRESS.toLowerCase()]: "VQLE",
};

// Helper: enrich a single token with remapped data + real metadata
async function enrichToken(collection, tokenIdStr, nftAddress) {
  const tokenId = String(tokenIdStr);
  const mapped = mapping[collection]?.[tokenId];

  let tokenURI = `${tokenId}.json`;
  let imageFile = `${tokenId}.png`;
  let name = `${collection} #${tokenId}`;
  let background = "Unknown";

  if (mapped) {
    tokenURI = mapped.token_uri || tokenURI;
    imageFile = mapped.image_file || (tokenURI.replace(/\.json$/i, ".png"));
  }

  // Load real metadata (name/background) from JSON file
  const jsonPath = path.join(METADATA_JSON_DIR, collection, tokenURI);
  if (fs.existsSync(jsonPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      name = meta.name || name;
      background = meta.background ||
                   meta.attributes?.find(a => a.trait_type?.toLowerCase() === "background")?.value ||
                   background;
    } catch (e) {
      console.warn(`Failed to parse metadata for ${collection} #${tokenId}: ${e.message}`);
    }
  }

  return {
    collection,
    tokenId,
    tokenURI,
    nftAddress,
    name,
    background,
    imageFile, // optional - frontend can use if needed
  };
}

// Helper: fetch owned tokenIds (no metadata here yet)
router.post("/force-cache/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  console.log(`Force cache requested for ${wallet}`);

  try {
    const cache = readOwnerCache();

    if (cache[wallet]) {
      console.log("Cache already exists — skipping scan");
      return res.json({ success: true, alreadyCached: true });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const vkin = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);
    const vqle = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLE_ABI, provider);

    console.log("Force-scanning VKIN...");
    const vkinIds = await fetchOwnedTokenIds(vkin, wallet, "VKIN");

    console.log("Force-scanning VQLE...");
    const vqleIds = await fetchOwnedTokenIds(vqle, wallet, "VQLE");

    cache[wallet] = { VKIN: vkinIds, VQLE: vqleIds };
    writeOwnerCache(cache);

    console.log(`Force cache filled: ${vkinIds.length} VKIN, ${vqleIds.length} VQLE`);

    res.json({ success: true, tokens: { VKIN: vkinIds.length, VQLE: vqleIds.length } });
  } catch (err) {
    console.error("Force cache failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /owned/:wallet
router.get("/owned/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  console.log("🔎 Owned NFTs request for:", wallet);

  const cache = readOwnerCache();
  let walletCache = cache[wallet] || { VKIN: [], VQLE: [] };

  // Force scan if cache is empty
  if (walletCache.VKIN.length === 0 && walletCache.VQLE.length === 0) {
    console.log("Cache miss/empty — scanning blockchain for", wallet);

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const vkin = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);
      const vqle = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLE_ABI, provider);

      console.log("Scanning VKIN...");
      const vkinIds = await fetchOwnedTokenIds(vkin, wallet, "VKIN");  // ← fixed: "VKIN"

      console.log("Scanning VQLE...");
      const vqleIds = await fetchOwnedTokenIds(vqle, wallet, "VQLE");  // ← fixed: "VQLE"

      walletCache = { VKIN: vkinIds, VQLE: vqleIds };
      cache[wallet] = walletCache;
      writeOwnerCache(cache);

      console.log(`Cache filled: ${vkinIds.length} VKIN, ${vqleIds.length} VQLE`);
    } catch (err) {
      console.error("On-chain scan failed:", err.message);
    }
  } else {
    console.log("Cache hit — using cached data");
  }

  // Enrich and return (your existing code)
// After cache fill or cache hit
const result = [];

// VKIN
for (const tokenId of walletCache.VKIN) {
  const mapped = mapping["VKIN"]?.[tokenId];
  const jsonFile = mapped?.token_uri || `${tokenId}.json`;
  const jsonPath = path.join(METADATA_JSON_DIR, "VKIN", jsonFile);

  let name = `VKIN #${tokenId}`;
  let background = "Unknown";

  if (fs.existsSync(jsonPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      name = meta.name || name;
      background = meta.attributes?.find(a => a.trait_type === "Background")?.value || background;
    } catch (e) {
      console.warn(`Metadata parse error for VKIN #${tokenId}`);
    }
  }

  result.push({
    nftAddress: VKIN_CONTRACT_ADDRESS,
    tokenId,
    name,
    background,
    tokenURI: jsonFile,
    collection: "VKIN"
  });
}

// VQLE (same pattern)
for (const tokenId of walletCache.VQLE) {
  const mapped = mapping["VQLE"]?.[tokenId];
  const jsonFile = mapped?.token_uri || `${tokenId}.json`;
  const jsonPath = path.join(METADATA_JSON_DIR, "VQLE", jsonFile);

  let name = `VQLE #${tokenId}`;
  let background = "Unknown";

  if (fs.existsSync(jsonPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      name = meta.name || name;
      background = meta.attributes?.find(a => a.trait_type === "Background")?.value || background;
    } catch (e) {
      console.warn(`Metadata parse error for VQLE #${tokenId}`);
    }
  }

  result.push({
    nftAddress: VQLE_CONTRACT_ADDRESS,
    tokenId,
    name,
    background,
    tokenURI: jsonFile,
    collection: "VQLE"
  });
}

res.json(result);
});

export default router;