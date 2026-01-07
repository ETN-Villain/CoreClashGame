import express from "express";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { MAPPING_FILE, METADATA_JSON_DIR, loadMapping } from "../paths.js";
import { RPC_URL, VKIN_CONTRACT_ADDRESS } from "../config.js";

const router = express.Router();

// Minimal ERC721 ABI for ownerOf
const VKIN_ABI = ["function ownerOf(uint256 tokenId) view returns (address)"];

router.get("/owned/:wallet", async (req, res) => {
  const { wallet } = req.params;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const nftContract = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);

  try {
    // Load mapping to get metadata for token IDs
    const mapping = loadMapping(); // { tokenId: token_uri }

    const ownedNFTs = [];

    // Instead of using CSV token_id blindly, iterate over token_uri keys (tokenIds)
    for (const tokenIdStr of Object.keys(mapping)) {
      const tokenId = BigInt(tokenIdStr);

      // check ownership on-chain
      let owner;
      try {
        owner = await nftContract.ownerOf(tokenId);
      } catch {
        continue; // skip burned/nonexistent
      }

      if (owner.toLowerCase() !== wallet.toLowerCase()) continue;

      // fetch metadata from cache
      const jsonFile = mapping[tokenIdStr];
      const metadataPath = path.join(METADATA_JSON_DIR, jsonFile);
      let metadata = {};
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      }

      ownedNFTs.push({
        tokenId: tokenId.toString(),
        nftAddress: VKIN_CONTRACT_ADDRESS,
        name: metadata.name || `Token #${tokenId}`,
        background: metadata.attributes?.find(a => a.trait_type === "Background")?.value || "Unknown",
      });
    }

    console.log(`Owned NFTs for ${wallet}:`, ownedNFTs.map(n => n.tokenId));
    res.json(ownedNFTs);
  } catch (err) {
    console.error("Failed to fetch owned NFTs:", err);
    res.status(500).json({ error: "Failed to fetch owned NFTs" });
  }
});

export default router;
