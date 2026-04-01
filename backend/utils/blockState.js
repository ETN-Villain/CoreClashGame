// backend/utils/blockState.js
import fs from "fs";
import path from "path";
import { withLock } from "./mutex.js";

const DATA_DIR = process.env.RENDER
  ? "/backend/data/state"
  : path.join(process.cwd(), "state");

const STATE_FILE = path.join(DATA_DIR, "lastBlock.json");

function ensureStateDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadLastBlock() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;

    const raw = fs.readFileSync(STATE_FILE, "utf8");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.lastBlock ?? null;
  } catch (err) {
    console.error("loadLastBlock error:", err);
    return null;
  }
}

export function saveLastBlock(block) {
  try {
    ensureStateDir();

    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(
      tempFile,
      JSON.stringify({ lastBlock: block }, null, 2),
      "utf8"
    );
    fs.renameSync(tempFile, STATE_FILE);
  } catch (err) {
    console.error("saveLastBlock error:", err);
    throw err;
  }
}

export async function loadLastBlockLocked() {
  return withLock(async () => {
    return loadLastBlock();
  });
}

export async function saveLastBlockLocked(block) {
  return withLock(async () => {
    saveLastBlock(block);
    return block;
  });
}