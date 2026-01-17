import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync"; // ✅ correct named import

// ---------- CONFIG ----------
const MAPPING_CSV = path.join(
  "C:/Users/Butle_jz8osua/ipfs-metadata-dapp/backend/mapping.csv"
);
const OUTPUT_MAPPING_FILE = path.join(
  "C:/Users/Butle_jz8osua/ipfs-metadata-dapp/src/mapping.json"
);

// ---------- LOAD CSV ----------
if (!fs.existsSync(MAPPING_CSV)) {
  console.error(`mapping.csv not found: ${MAPPING_CSV}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(MAPPING_CSV, "utf8");

// Parse CSV
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
});

// ---------- BUILD FRONTEND MAPPING ----------
const mapping = {};

for (const nft of records) {
  const collection = nft.collection;
  const tokenId = nft.token_id;
  const tokenURI = nft.token_uri;

  if (!collection || !tokenId || !tokenURI) {
    console.warn(`⚠️ Skipping invalid CSV row:`, nft);
    continue;
  }

  if (!mapping[collection]) mapping[collection] = {};
  mapping[collection][tokenId] = tokenURI;
}

// ---------- WRITE FRONTEND MAPPING ----------
fs.writeFileSync(OUTPUT_MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log(`✅ Frontend mapping.json generated at ${OUTPUT_MAPPING_FILE}`);
console.log(mapping);
