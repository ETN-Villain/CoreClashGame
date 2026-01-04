// backend/utils/blockState.js
import fs from "fs";
import path from "path";

const STATE_FILE = path.join(process.cwd(), "state", "lastBlock.json");

export function loadLastBlock() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).lastBlock;
  } catch {
    return null;
  }
}

export function saveLastBlock(block) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastBlock: block }, null, 2));
}
