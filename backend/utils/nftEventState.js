import fs from "fs";
import path from "path";
import { withLock } from "./mutex.js";

const DATA_DIR = fs.existsSync("/backend/data")
  ? "/backend/data/state"
  : path.join(process.cwd(), "state");

const STATE_FILE = path.join(DATA_DIR, "nftEventState.json");

function ensureStateDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("readState error:", err);
    return {};
  }
}

function writeState(state) {
  ensureStateDir();
  const tempFile = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tempFile, STATE_FILE);
}

export async function hasSeenNftEvent(eventKey) {
  return withLock(async () => {
    const state = readState();
    return !!state[eventKey];
  });
}

export async function markSeenNftEvent(eventKey) {
  return withLock(async () => {
    const state = readState();
    state[eventKey] = new Date().toISOString();
    writeState(state);
  });
}