import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync"; // ✅ correct named import

// ---------- CONFIG ----------
const MAPPING_CSV = path.join(
  "C:/Users/Butle_jz8osua/coreclashgame/backend/mapping.csv"
);
const OUTPUT_MAPPING_FILE = path.join(
  "C:/Users/Butle_jz8osua/coreclashgame/src/mapping.json"
);

// ---------- LOAD CSV ----------
if (!fs.existsSync(MAPPING_CSV)) {
  console.error(`mapping.csv not found: ${MAPPING_CSV}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(MAPPING_CSV, "utf8");

// Parse CSV with headers
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

// ---------- BUILD FRONTEND MAPPING ----------
const mapping = {};

for (const row of records) {
  const {
    collection,
    token_id: tokenId,
    token_uri: tokenURI,
    image_file: imageFile, // new column
  } = row;

  if (!collection || !tokenId || !tokenURI) {
    console.warn(`⚠️ Skipping invalid CSV row (missing required fields):`, row);
    continue;
  }

  if (!mapping[collection]) {
    mapping[collection] = {};
  }

  // Store both fields – frontend can prefer image_file
  mapping[collection][tokenId] = {
    token_uri: tokenURI.trim(),
    image_file: (imageFile || tokenURI.replace(/\.json$/i, ".png")).trim(),
  };

  console.log(`Added: ${collection} #${tokenId} → ${tokenURI} / ${mapping[collection][tokenId].image_file}`);
}

// ---------- WRITE FRONTEND MAPPING ----------
fs.writeFileSync(OUTPUT_MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log(`\n✅ Frontend mapping.json generated at ${OUTPUT_MAPPING_FILE}`);
console.log(`Total collections: ${Object.keys(mapping).length}`);
console.log(`Total tokens: ${Object.values(mapping).reduce((sum, col) => sum + Object.keys(col).length, 0)}`);
console.log("\nSample output (first few):");
console.log(JSON.stringify(mapping, null, 2).slice(0, 500) + "...");