import React from "react";
import mapping from "./mapping.json";
import { StableImage } from './gameCard';

const BACKEND_URL = "http://localhost:3001";

// Mapping (lowercase + checksummed)
const addressToCollection = {
  "0x3fc7665b1f6033ff901405cddf31c2e04b8a2ab4": "VKIN",
  "0x3FC7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cfbb04c54d35e2e8471ad9040d40d73c08136f0": "VQLE",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
};

export const renderTokenImages = (input = []) => {
  console.log("[renderTokenImages] Raw input:", JSON.stringify(input, null, 2));

  let tokens = [];

  if (Array.isArray(input)) {
    tokens = input;
  } else if (input && typeof input === 'object') {
    const { nftContracts = [], tokenIds = [], tokenURIs = [] } = input;

    tokens = tokenIds.map((id, idx) => {
      let rawAddr = nftContracts[idx];
      console.log(`Slot ${idx} raw type:`, typeof rawAddr, 'length:', rawAddr?.length || 'N/A');

      let addr = (rawAddr || "").toString().trim();

      // Log char codes to detect hidden chars
      const charCodes = addr.split('').map(c => c.charCodeAt(0)).join(', ');
      console.log(`Slot ${idx} char codes:`, charCodes);

addr = (addr || '')
   .replace(/[^0-9a-fA-F]/gi, '')           // remove 'x' too unless intentional
   .toLowerCase();

 if (addr && !addr.startsWith('0x')) {
   addr = '0x' + addr;
 }

let collection = addressToCollection[addr];

      // Debug override for token ID 24 (remove after fix)
      if (id === "24") {
        console.log(`Slot ${idx} token ID 24 → forcing VQLE (debug override)`);
        collection = "VQLE";
      }

      // More forgiving pattern match
// More forgiving pattern match
if (!collection && (
  addr.includes('8cfb') ||
  addr.includes('8cfbb04c')
)) {
  console.log(`Slot ${idx} VQLE pattern match → forcing VQLE`);
  collection = "VQLE";
} 
      if (!collection) {
        console.warn(`Slot ${idx} NO MATCH for cleaned addr "${addr}" (raw: "${rawAddr}") — defaulting to VKIN`);
        collection = "VKIN";
      }

      console.log(`Slot ${idx} final:`, {
        rawAddr,
        cleanedAddr: addr,
        collection,
        tokenId: id,
        tokenURI: tokenURIs[idx] || "none"
      });

// ── inside the tokenIds.map callback ──

let imageFile = `${id}.png`;

// Look up the mapping entry once — safe even if missing
const mapped = mapping[collection]?.[String(id)];

// Priority 1: explicit tokenURI from backend (highest precedence)
if (tokenURIs[idx]) {
  // If tokenURI is present, derive filename from it
  imageFile = tokenURIs[idx]
    .replace(/\.json$/i, ".png")
    .toLowerCase();

  console.log(`Slot ${idx}: backend tokenURI → ${imageFile} (coll: ${collection})`);
}
// Priority 2: use mapping.json if we have an entry
else if (mapped) {
  imageFile = mapped?.image_file ??
    mapped?.token_uri?.replace(/\.json$/i, ".png") ??
    `${id}.png`;

  console.log(`Slot ${idx}: mapping → ${imageFile}`);
}
// Priority 3: fallback (already set above)

console.log(`Slot ${idx} final imageFile: ${imageFile}`);

return {
  collection,
  tokenId: id,
  imageFile
};
    });
  }

  if (!tokens.length) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {tokens.map((token, i) => {
        const { collection, tokenId, imageFile } = token;

        let finalImageFile = imageFile;

        const mapped = mapping[collection]?.[String(tokenId)];
        if (mapped) {
finalImageFile = mapped?.image_file ??
  mapped?.token_uri?.replace(/\.json$/i, ".png") ??
  `${tokenId}.png`;
        }

        const src = `${BACKEND_URL}/images/${collection}/${finalImageFile}`;

        console.log(`Rendering slot ${i}: ${src}`);

        return (
          <StableImage
            key={`${collection}-${tokenId}-${i}`}
            src={src}
            alt={`${collection} #${tokenId}`}
          />
        );
      })}
    </div>
  );
};