import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import VKIN_ABI_JSON from "../src/abis/VKINABI.json" assert { type: "json" };
import VQLE_ABI_JSON from "../src/abis/VQLEABI.json" assert { type: "json" };
import { RPC_URL } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Base folder for all JSON metadata ---
// Individual collections will use subfolders: VKIN, VQLE
export const METADATA_JSON_DIR = path.join(__dirname, "metadata-cache", "json");
export const METADATA_IMAGES_DIR = path.join(__dirname, "metadata-cache", "images");

export const MAPPING_FILE = path.join(__dirname, "mapping.csv");
export const REVEAL_DIR = path.join(__dirname, "reveals");

export const VKIN_ABI = VKIN_ABI_JSON;
export const VQLE_ABI = VQLE_ABI_JSON;

export { RPC_URL };

// --- Load mapping CSV for VKIN/VQLE tokenId -> { token_uri, image_file } ---
export function loadMapping() {
  if (!fs.existsSync(MAPPING_FILE)) {
    console.warn("mapping.csv not found → empty mapping");
    return {};
  }

  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const map = {};

  for (const r of records) {
    const collection = r.collection?.toUpperCase();
    const tokenId = String(r.token_id); // string key!

    if (!collection || !tokenId) {
      console.warn(`Invalid CSV row skipped:`, r);
      continue;
    }

    if (!map[collection]) map[collection] = {};

    map[collection][tokenId] = {
      token_uri: r.token_uri?.trim(),
      image_file: r.image_file?.trim() || (r.token_uri ? r.token_uri.replace(/\.json$/i, ".png") : `${tokenId}.png`),
    };

    console.log(`Loaded: ${collection} #${tokenId} → ${map[collection][tokenId].token_uri}`);
  }

  return map;
}