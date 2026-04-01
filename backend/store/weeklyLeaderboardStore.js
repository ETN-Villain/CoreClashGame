import fs from "fs";
import path from "path";
import { withLock } from "../utils/mutex.js";

const DATA_DIR = process.env.RENDER
  ? "/backend/data/leaderboards"
  : path.join(process.cwd(), "store");

const STORE_FILE = path.join(DATA_DIR, "weeklyLeaderboards.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("📁 Created weekly leaderboard directory:", DATA_DIR);
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({}, null, 2), "utf8");
    console.log("🆕 Created weeklyLeaderboards.json:", STORE_FILE);
  }
}

export function readWeeklyLeaderboards() {
  ensureStore();

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("readWeeklyLeaderboards error:", err);
    return {};
  }
}

export function writeWeeklyLeaderboards(data) {
  ensureStore();

  try {
    const tempFile = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempFile, STORE_FILE);
  } catch (err) {
    console.error("writeWeeklyLeaderboards error:", err);
    throw err;
  }
}

export async function saveWeeklyLeaderboard(weekStart, top3) {
  return withLock(async () => {
    const all = readWeeklyLeaderboards();
    all[weekStart] = top3;
    writeWeeklyLeaderboards(all);
    return all;
  });
}

export async function getWeeklyLeaderboardsSorted() {
  return withLock(async () => {
    const leaderboards = readWeeklyLeaderboards();

    return Object.keys(leaderboards)
      .sort((a, b) => new Date(b) - new Date(a))
      .reduce((acc, key) => {
        acc[key] = leaderboards[key];
        return acc;
      }, {});
  });
}