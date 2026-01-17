import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "owners.json");

console.log("🔥 ownerCache.js LOADED FROM:", import.meta.url);

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log("📁 Created cache directory:", CACHE_DIR);
  }
}

/**
 * Read owner cache from disk
 * Returns: { [wallet]: { VKIN: [], VQLE: [] } }
 */
export function readOwnerCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

  // Normalize old cache format (wallet -> array) to new structure
  for (const wallet of Object.keys(raw)) {
    if (!raw[wallet].VKIN && !raw[wallet].VQLE) {
      raw[wallet] = { VKIN: raw[wallet] || [], VQLE: [] };
    }
  }

  return raw;
}

/**
 * Write owner cache to disk
 * cache: { [wallet]: { VKIN: [], VQLE: [] } }
 */
export function writeOwnerCache(cache) {
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  console.log("💾 Owner cache written");
}

/**
 * Delete entire owner cache
 */
export function deleteCache() {
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
    console.log("🗑️ Owner cache deleted");
  }
}
