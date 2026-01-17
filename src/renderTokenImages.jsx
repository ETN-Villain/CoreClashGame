import React from "react";
import mapping from "./mapping.json";
import { WHITELISTED_NFTS } from "./config.js";
import { StableImage } from './gameCard';  // if it's exported from there

const BACKEND_URL = "http://localhost:3001";

const addressToCollection = WHITELISTED_NFTS.reduce((acc, nft) => {
  acc[nft.address.toLowerCase()] = nft.label === "Verdant Kin" ? "VKIN" : "VQLE";
  return acc;
}, {});

export const renderTokenImages = (input = []) => {
  let tokens = [];

  // Case 1: Direct array of tokens/objects/URIs
  if (Array.isArray(input)) {
    tokens = input;
  }
  // Case 2: Backend reveal object (settled/revealed games)
  else if (input && typeof input === 'object') {
    const { nftContracts = [], tokenIds = [], tokenURIs = [] } = input;

    console.log("[renderTokenImages] Backend reveal data:", {
      tokenIds,
      tokenURIs,
      nftContracts
    });

    tokens = tokenIds.map((id, idx) => {
      const addr = nftContracts[idx];
      const collection = addressToCollection[addr?.toLowerCase()] || "VKIN";

      let imageFile = `${id}.png`; // fallback

      // Primary: use backend pre-remapped tokenURI
      if (tokenURIs[idx]) {
        imageFile = tokenURIs[idx]
          .replace(/\.json$/i, ".png")
          .toLowerCase();
        console.log(`Slot ${idx}: Using backend tokenURI → ${imageFile}`);
      }
      // Fallback: map from tokenId if backend didn't provide
      else if (id && mapping[collection]?.[String(id)]) {
        imageFile = mapping[collection][String(id)]
          .replace(/\.json$/i, ".png")
          .toLowerCase();
        console.log(`Slot ${idx}: Fallback to mapping → ${imageFile}`);
      }

      return {
        collection,
        tokenId: id,
        imageFile
      };
    });
  }

  if (!tokens.length) {
    console.log("[renderTokenImages] No valid tokens after normalization");
    return null;
  }

  console.log("[renderTokenImages] Rendering tokens:", tokens.map(t => t.imageFile));

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {tokens.map((token, i) => {
        const { collection, tokenId, imageFile } = token;

        console.log(`Processing slot ${i}:`, { collection, tokenId, imageFile });

        if (!collection || !imageFile) {
          console.log(`Slot ${i} → skeleton (missing info)`);
          return (
            <div
              key={`skeleton-${i}`}
              style={{
                width: 80,
                height: 80,
                background: "#111",
                border: "1px solid #333",
                borderRadius: 6,
              }}
            />
          );
        }

        const src = `${BACKEND_URL}/images/${collection}/${imageFile}`;

        console.log(`Rendering slot ${i}: ${src}`);

        return (
          <StableImage
            key={`${collection}-${tokenId || i}-${i}`}
            src={src}
            alt={`${collection} #${tokenId || '?'}`}
          />
        );
      })}
    </div>
  );
};