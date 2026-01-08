import express from "express";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { MAPPING_FILE, METADATA_JSON_DIR, loadMapping } from "../paths.js";
import { RPC_URL, VKIN_CONTRACT_ADDRESS } from "../config.js";

const router = express.Router();

// Minimal ERC721 ABI for ownerOf
// ---------------- GET OWNED NFTs ----------------
const VKIN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

import { readOwnerCache, writeOwnerCache } from "../utils/ownerCache.js";
const delay = ms => new Promise(r => setTimeout(r, ms));

router.get("/owned/:wallet", async (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  console.log("🔎 Owned NFTs request for:", wallet);

const cache = readOwnerCache();

if (cache[wallet]) {
  // Filter out NFTs with missing background
  const incomplete = cache[wallet].some(n => n.background === "Unknown");
  if (incomplete) {
    console.log(`🗑️ Removing incomplete metadata for wallet ${wallet}`);
    // Keep only NFTs with known background, or clear all
    cache[wallet] = cache[wallet].filter(n => n.background !== "Unknown");
    writeOwnerCache(cache); // persist changes
  } else {
    console.log("⚡ Cache hit for", wallet, "- returning", cache[wallet].length, "NFTs");
    return res.json(cache[wallet]);
  }
}

  console.log("⛓️ Cache miss — scanning blockchain");

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const nft = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);

    const balance = Number(await nft.balanceOf(wallet));
    console.log(`📦 Wallet owns ${balance} NFTs`);

    const ownedNFTs = [];

    for (let i = 0; i < balance; i++) {
      let tokenId;
      try {
        tokenId = await nft.tokenOfOwnerByIndex(wallet, i);
      } catch (err) {
        console.warn(`⚠️ Failed to get token at index ${i}: ${err.message}`);
        // Wait a bit and retry
        await delay(500);
        i--; // retry same index
        continue;
      }

      // Metadata
      let metadata = {};
      try {
        const uri = await nft.tokenURI(tokenId);
        const fileName = path.basename(uri);
        const jsonPath = path.join(METADATA_JSON_DIR, fileName);
        if (fs.existsSync(jsonPath)) metadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } catch {}

      ownedNFTs.push({
        tokenId: tokenId.toString(),
        tokenURI: fileName,
        nftAddress: VKIN_CONTRACT_ADDRESS,
        name: metadata.name || `Token #${tokenId}`,
        background: metadata.attributes?.find(a => a.trait_type === "Background")?.value || "Unknown"
      });

      // Short delay to prevent RPC rate limit
      await delay(50);
    }

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
