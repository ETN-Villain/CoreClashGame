import fs from "fs";
import { parse } from "csv-parse/sync";
import { MAPPING_FILE, FRONTEND_MAPPING_FILE, ensureDataPaths } from "./paths.js";

ensureDataPaths();

if (!fs.existsSync(MAPPING_FILE)) {
  console.error(`mapping.csv not found: ${MAPPING_FILE}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(MAPPING_FILE, "utf8");

const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

const mapping = {};

for (const row of records) {
  const {
    collection,
    token_id: tokenId,
    token_uri: tokenURI,
    image_file: imageFile,
  } = row;

  if (!collection || !tokenId || !tokenURI) {
    console.warn("⚠️ Skipping invalid CSV row:", row);
    continue;
  }

  if (!mapping[collection]) mapping[collection] = {};

  mapping[collection][tokenId] = {
    token_uri: tokenURI.trim(),
    image_file: (imageFile || tokenURI.replace(/\.json$/i, ".png")).trim(),
  };
}

fs.writeFileSync(FRONTEND_MAPPING_FILE, JSON.stringify(mapping, null, 2));
console.log(`✅ Frontend mapping.json generated at ${FRONTEND_MAPPING_FILE}`);
console.log(`Total collections: ${Object.keys(mapping).length}`);
console.log(
  `Total tokens: ${Object.values(mapping).reduce(
    (sum, col) => sum + Object.keys(col).length,
    0
  )}`
);