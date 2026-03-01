import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE = path.join(__dirname, "burnTotal.json");

export function readBurnTotal() {
  try {
    if (!fs.existsSync(FILE)) return 0n;
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return BigInt(data.totalBurnWei);
  } catch (err) {
    console.error("readBurnTotal error:", err);
    return 0n;
  }
}

export function writeBurnTotal(totalWei) {
  fs.writeFileSync(
    FILE,
    JSON.stringify({ totalBurnWei: totalWei.toString() }, null, 2)
  );
}