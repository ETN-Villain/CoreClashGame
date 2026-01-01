import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";  // ✅ named import

// ---------- CONFIG ----------
const MAPPING_FILE = path.join("C:/Users/Butle_jz8osua/ipfs-metadata-dapp/backend/mapping.csv");

// Example frontend NFTs you want to check
const frontendNFTs = [
  { tokenId: 59 },
  { tokenId: 395 },
  { tokenId: 468 },
  { tokenId: 1 },   // example
  { tokenId: 2 }    // example
];

// ---------- LOAD CSV MAPPING ----------
if (!fs.existsSync(MAPPING_FILE)) {
  console.error(`Mapping file not found: ${MAPPING_FILE}`);
  process.exit(1);
}

const csvText = fs.readFileSync(MAPPING_FILE, "utf8");
const records = parse(csvText, { columns: true, skip_empty_lines: true });

const tokenURIMapping = {};
for (const r of records) {
  tokenURIMapping[Number(r.token_id)] = r.token_uri;
}

// ---------- VERIFY FRONTEND NFTs ----------
frontendNFTs.forEach(nft => {
  const expectedURI = tokenURIMapping[nft.tokenId];
  if (!expectedURI) {
    console.log(`Token ID ${nft.tokenId} is missing from mapping.csv`);
  } else {
    console.log(`Token ID ${nft.tokenId} → ${expectedURI}`);
  }
});
