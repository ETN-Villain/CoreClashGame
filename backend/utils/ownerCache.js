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

export function readOwnerCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
}

export function writeOwnerCache(cache) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify(cache, null, 2),
    "utf8"
  );
  console.log("💾 Owner cache written");
}