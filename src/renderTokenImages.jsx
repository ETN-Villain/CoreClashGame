import React from "react";
import mapping from "./mapping.json";
import { StableImage } from './gameCard';
import { BACKEND_URL } from "./config.js"

// Mapping (lowercase + checksummed)
const addressToCollection = {
  "0x3fc7665b1f6033ff901405cddf31c2e04b8a2ab4": "VKIN",
  "0x3FC7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cfbb04c54d35e2e8471ad9040d40d73c08136f0": "VQLE",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
  "0xac620b1a3de23f4eb0a69663613babf73f6c535d": "SCIONS",
  "0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D": "SCIONS",
};

export const renderTokenImages = (input = []) => {
  console.log("[renderTokenImages] Raw input:", JSON.stringify(input, null, 2));

  let tokens = [];

  if (Array.isArray(input)) {
    tokens = input;
  } else if (input && typeof input === "object") {
    const { nftContracts = [], tokenIds = [], tokenURIs = [] } = input;

    tokens = tokenIds.map((id, idx) => {
      let rawAddr = nftContracts[idx];
      console.log(`Slot ${idx} raw type:`, typeof rawAddr, "length:", rawAddr?.length || "N/A");

      let addr = (rawAddr || "").toString().trim();

      const charCodes = addr.split("").map((c) => c.charCodeAt(0)).join(", ");
      console.log(`Slot ${idx} char codes:`, charCodes);

      addr = addr.replace(/[^0-9a-fA-F]/gi, "").toLowerCase();

      if (addr && !addr.startsWith("0x")) {
        addr = "0x" + addr;
      }

      let collection = addressToCollection[addr];

      // Debug override for token ID 24 (remove after fix)
      if (id === "24") {
        console.log(`Slot ${idx} token ID 24 → forcing VQLE (debug override)`);
        collection = "VQLE";
      }

      // More forgiving pattern match
      if (!collection && (addr.includes("8cfb") || addr.includes("8cfbb04c"))) {
        console.log(`Slot ${idx} VQLE pattern match → forcing VQLE`);
        collection = "VQLE";
      }

      if (!collection) {
        console.warn(
          `Slot ${idx} NO MATCH for cleaned addr "${addr}" (raw: "${rawAddr}") — defaulting to VKIN`
        );
        collection = "VKIN";
      }

      // SCIONS uses VKIN mapping, but SCIONS image folder
      const mappingKey =
        collection === "SCIONS" || collection === "VKIN" ? "VKIN" : "VQLE";

      console.log(`Slot ${idx} final:`, {
        rawAddr,
        cleanedAddr: addr,
        collection,
        mappingKey,
        tokenId: id,
        tokenURI: tokenURIs[idx] || "none",
      });

      let imageFile = `${id}.png`;

      const mapped = mapping[mappingKey]?.[String(id)];

      // Priority 1: explicit tokenURI from backend
      if (tokenURIs[idx]) {
        imageFile = tokenURIs[idx]
          .replace(/\.json$/i, ".png")
          .toLowerCase();

        console.log(
          `Slot ${idx}: backend tokenURI → ${imageFile} (coll: ${collection}, mappingKey: ${mappingKey})`
        );
      }
      // Priority 2: mapping.json
      else if (mapped) {
        imageFile =
          mapped?.image_file ??
          mapped?.token_uri?.replace(/\.json$/i, ".png") ??
          `${id}.png`;

        console.log(`Slot ${idx}: mapping → ${imageFile}`);
      }

      console.log(`Slot ${idx} final imageFile: ${imageFile}`);

      return {
        collection,
        mappingKey,
        tokenId: id,
        imageFile,
      };
    });
  }

  if (!tokens.length) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {tokens.map((token, i) => {
        const { collection, mappingKey, tokenId, imageFile } = token;

        let finalImageFile = imageFile;

        const mapped = mapping[mappingKey]?.[String(tokenId)];
        if (mapped) {
          finalImageFile =
            mapped?.image_file ??
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