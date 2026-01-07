import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";
import VKIN_ABI_JSON from "../src/abis/VKINABI.json" assert { type: "json" };
import { RPC_URL } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const METADATA_JSON_DIR = path.join(__dirname, "metadata-cache", "json");
export const MAPPING_FILE = path.join(__dirname, "mapping.csv");
export const REVEAL_DIR = path.join(__dirname, "reveals");
export const VKIN_ABI = VKIN_ABI_JSON;
export { RPC_URL };

export function loadMapping() {
  if (!fs.existsSync(MAPPING_FILE)) return {};

  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true
  });

  const map = {};
  for (const r of records) {
    map[Number(r.token_id)] = r.token_uri;
  }
  return map;
  
}