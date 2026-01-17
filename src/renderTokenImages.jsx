import React from "react";
import mapping from "./mapping.json";
import { WHITELISTED_NFTS } from "./config.js";
import { StableImage } from './gameCard';  // if it's exported from there

const BACKEND_URL = "http://localhost:3001";

const addressToCollection = WHITELISTED_NFTS.reduce((acc, nft) => {
  acc[nft.address.toLowerCase()] = nft.label === "Verdant Kin" ? "VKIN" : "VQLE";
  return acc;
}, {});

export const renderTokenImages = (tokens = []) => {
  console.log('[renderTokenImages ENTRY] tokens raw:', tokens);
  console.log('[renderTokenImages ENTRY] length:', tokens?.length);
  console.log('[renderTokenImages ENTRY] first item:', tokens?.[0]);

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    console.log('[renderTokenImages] No tokens array');
    return null;
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
{tokens.map((tokenRaw, i) => {
  let token = tokenRaw;

  // If token is just a string URI → treat as fallback
  if (typeof token === 'string') {
    console.log(`[Slot ${i}] token is raw URI string:`, token);
    const imageFile = token.split('/').pop().replace('.json', '.png') || 'placeholder.png';
    const src = `${BACKEND_URL}/images/VKIN/${imageFile}`; // assume VKIN for now
    return <StableImage key={i} src={src} alt="Token from URI" />;
  }

  // If token is object but missing fields → try to extract
  const address = token?.address || token?.contract;
  const tokenId = token?.tokenId || token?.id || token?.token_id;
  const metadata = token?.metadata || token?.metadataObject;

  const collection = addressToCollection[address?.toLowerCase()] || "VKIN"; // fallback VKIN

  console.log(`[Slot ${i}] extracted:`, { collection, tokenId, hasMetadata: !!metadata });

  if (!tokenId || !collection) {
    return <div key={`skel-${i}`} style={{width:80, height:80, background:'#111', border:'1px solid #333', borderRadius:6}} />;
  }

  // Proceed with mapping lookup using extracted tokenId
  const tokenIdStr = String(tokenId);
  const mappedJson = mapping[collection]?.[tokenIdStr];

  let imageFile = mappedJson ? mappedJson.replace(".json", ".png") : `${tokenIdStr}.png`;

  const src = `${BACKEND_URL}/images/${collection}/${imageFile}`;

  return (
    <img
      key={`${collection}-${tokenIdStr}-${i}`}
      src={src}
      alt={metadata?.name || `${collection} #${tokenIdStr}`}
      style={{ width: 80, height: 80, objectFit: "cover", border: "1px solid #333", borderRadius: 6 }}
      onError={e => {
        e.target.src = "/placeholder.png";
      }}
    />
  );
})}
    </div>
  );
};