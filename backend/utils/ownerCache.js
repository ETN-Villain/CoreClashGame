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
// In readOwnerCache
export function readOwnerCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    console.log("No owner cache found, starting fresh");
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

    // Normalize ALL keys to lowercase
    const normalized = {};
    for (const wallet in raw) {
      const lowerWallet = wallet.toLowerCase();
      normalized[lowerWallet] = raw[wallet];
    }

    console.log(`Loaded owner cache with ${Object.keys(normalized).length} wallets (normalized)`);
    return normalized;
  } catch (err) {
    console.error("Failed to read owner cache:", err.message);
    return {};
  }
}

// In writeOwnerCache — normalize key before writing
export function writeOwnerCache(cache) {
  ensureCacheDir();
  try {
    const normalizedCache = {};
    for (const wallet in cache) {
      const lowerWallet = wallet.toLowerCase();
      normalizedCache[lowerWallet] = cache[wallet];
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(normalizedCache, null, 2), "utf8");
    console.log(`💾 Owner cache written (${Object.keys(normalizedCache).length} wallets, all lowercase)`);
  } catch (err) {
    console.error("Failed to write owner cache:", err.message);
  }
}

/**
 * Delete a specific cache key (e.g. vkin_owned_0xabc...)
 */
export function deleteCache(key) {
  if (!fs.existsSync(CACHE_FILE)) return;

  try {
    const cache = readOwnerCache(); // load current
    if (cache[key]) {
      delete cache[key];
      writeOwnerCache(cache);
      console.log(`Cache key deleted: ${key}`);
    }
  } catch (err) {
    console.error("Failed to delete cache key:", key, err.message);
  }
}