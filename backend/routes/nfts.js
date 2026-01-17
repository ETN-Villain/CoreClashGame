import express from "express";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { METADATA_JSON_DIR } from "../paths.js";
import { RPC_URL, VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "../config.js";
import { readOwnerCache, writeOwnerCache } from "../utils/ownerCache.js";

// Import each ABI separately
import VKIN_ABI from "../../src/abis/VKINABI.json" assert { type: "json" };
import VQLE_ABI from "../../src/abis/VQLEABI.json" assert { type: "json" };

const router = express.Router();
const delay = ms => new Promise(r => setTimeout(r, ms));

// Helper to fetch owned NFTs with cache support
async function fetchOwnedNFTs(contract, nftAddress, wallet, isRandom = false) {
  const nfts = [];
  const collection = nftAddress === VQLE_CONTRACT_ADDRESS ? "VQLE" : "VKIN";

  let tokenIds = [];

  if (collection === "VKIN") {
    // VKIN uses Enumerable
    const balance = Number(await contract.balanceOf(wallet));
    for (let i = 0; i < balance; i++) {
      try {
        const tokenId = await contract.tokenOfOwnerByIndex(wallet, i);
        tokenIds.push(tokenId.toString());
      } catch (err) {
        console.warn(`⚠️ Failed to get token at index ${i} for VKIN: ${err.message}`);
        await delay(500);
        i--; // retry
      }
    }
  } else {
    // VQLE: no tokenOfOwnerByIndex → scan IDs manually
    const MAX_TOKEN_ID = 1000; // adjust based on collection size
    for (let t = 1; t <= MAX_TOKEN_ID; t++) {
      try {
        const owner = await contract.ownerOf(BigInt(t));
        if (owner.toLowerCase() === wallet.toLowerCase()) tokenIds.push(t.toString());
      } catch {
        // token not minted or doesn't exist
        continue;
      }
    }
  }

  // --- Load/generate metadata and populate nfts ---
  for (const tokenId of tokenIds) {
    let fileName, metadata = {};
    try {
      const collectionDir = path.join(METADATA_JSON_DIR, collection);
      if (!fs.existsSync(collectionDir)) fs.mkdirSync(collectionDir, { recursive: true });

      fileName = `${tokenId}.json`;
      const jsonPath = path.join(collectionDir, fileName);

      if (fs.existsSync(jsonPath)) {
        metadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } else if (collection === "VQLE") {
        metadata = { name: `VQLE #${tokenId}`, attributes: [{ trait_type: "Background", value: "Unknown" }] };
        fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
        console.log(`💾 Generated metadata for VQLE token ${tokenId}`);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to load/generate metadata for ${collection} token ${tokenId}: ${err.message}`);
    }

    nfts.push({
      collection,
      tokenId,
      tokenURI: fileName,
      nftAddress,
      name: metadata.name || `${collection} #${tokenId}`,
      background: metadata.attributes?.find(a => a.trait_type === "Background")?.value || "Unknown"
    });

    await delay(isRandom ? 250 : 100);
  }

  return nfts;
}

// --- GET /owned/:wallet ---
router.get("/owned/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  console.log("🔎 Owned NFTs request for:", wallet);

  const cache = readOwnerCache();

const walletCache = cache[wallet] || { VKIN: [], VQLE: [] };

// Remove incomplete NFTs per collection
["VKIN", "VQLE"].forEach((collection) => {
  const incomplete = walletCache[collection].some(n => n.background === "Unknown");
  if (incomplete) {
    console.log(`🗑️ Removing incomplete metadata for ${collection} of wallet ${wallet}`);
    walletCache[collection] = walletCache[collection].filter(n => n.background !== "Unknown");
    cache[wallet] = walletCache; // update main cache object
    writeOwnerCache(cache);
  }
});

// Combine VKIN + VQLE for frontend consumption
const combinedNFTs = [...walletCache.VKIN, ...walletCache.VQLE];

if (combinedNFTs.length > 0) {
  console.log("⚡ Cache hit for", wallet, "- returning", combinedNFTs.length, "NFTs");
  return res.json(combinedNFTs);
}

  console.log("⛓️ Cache miss — scanning blockchain");

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const vkin = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);
    const vqle = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLE_ABI, provider);

    // Fetch VKIN (random mapping)
    const vkinNFTs = await fetchOwnedNFTs(vkin, VKIN_CONTRACT_ADDRESS, wallet, true);

    // Fetch VQLE (simple mapping)
    const vqleNFTs = await fetchOwnedNFTs(vqle, VQLE_CONTRACT_ADDRESS, wallet, false);

    const ownedNFTs = [...vkinNFTs, ...vqleNFTs];

    cache[wallet] = ownedNFTs;
    writeOwnerCache(cache);

    console.log(`✅ Found ${ownedNFTs.length} NFTs for ${wallet}`);
    res.json(ownedNFTs);

  } catch (err) {
    console.error("❌ Owned route error:", err);
    res.status(500).json({ error: "Failed to fetch owned NFTs" });
  }
});

export default router;
