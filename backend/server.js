import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { generateMapping } from "./utils/generateMapping.js";
import { checkFrontendMapping } from "../src/checkFrontendMapping.js";

import { initAdminWallet } from "./admin.js";
import {
  loadMapping,
  METADATA_JSON_DIR,
  METADATA_IMAGES_DIR,
  ensureDataPaths,
  FRONTEND_MAPPING_FILE,
  WEEKLY_LEADERBOARD_FILE,
} from "./paths.js";
import { readGames } from "./store/gamesStore.js";
import { readBurnTotal } from "./store/burnStore.js";

import gamesRouter from "./routes/games.js";
import sseRouter from "./routes/sse.js";
import nftsRouter from "./routes/nfts.js";
import leaderboardRouter from "./routes/leaderboard.js";
import { backfillWeeklyLeaderboardsFromGames } from "./store/weeklyLeaderboardStore.js";

import { reconcileActiveGamesScheduled } from "./reconcile.js";
import "./eventListener.js";

import xpRouter from "./routes/xp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

const weeklyFilePath = WEEKLY_LEADERBOARD_FILE;

// ---------------- MIDDLEWARE ----------------
app.use(cors({
  origin: [
    "https://coreclash.planetzephyros.xyz",
    "https://planetzephyros.xyz",
    "https://coreclashgame.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-wallet", "x-address"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

app.options("*", cors());
app.use(express.json());

// ---------------- STATIC ----------------
app.use("/images", express.static(METADATA_IMAGES_DIR));

app.get("/mapping.json", (req, res) => {
  res.sendFile(FRONTEND_MAPPING_FILE);
});

// ---------------- ROUTES ----------------
app.use("/games", gamesRouter);
app.use("/leaderboard", leaderboardRouter);
app.use("/events", sseRouter);
app.use("/nfts", nftsRouter);
app.use("/xp", xpRouter);

// ---------------- METADATA ----------------
app.get("/metadata/:collection/:tokenId", (req, res) => {
  try {
    const { collection, tokenId } = req.params;
    const mapping = loadMapping();
    const collectionKey = collection.toUpperCase();

    const mapped = mapping[collectionKey]?.[String(tokenId)];
    if (!mapped) {
      return res.status(404).json({ error: "Token not found in mapping" });
    }

    const jsonFile = mapped.token_uri || `${tokenId}.json`;
    const imageFile = mapped.image_file || `${tokenId}.png`;

    const filePath = path.join(METADATA_JSON_DIR, collectionKey, jsonFile);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Metadata file missing" });
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

    return res.json({
      ...data,
      image_file: imageFile,
    });
  } catch (err) {
    console.error("Metadata route error:", err);
    return res.status(500).json({ error: "Failed to load metadata" });
  }
});

// ---------------- VALIDATE ----------------
app.post("/games/validate", (req, res) => {
  try {
    const { nfts } = req.body;

    if (!Array.isArray(nfts)) {
      return res.status(400).json({ error: "Invalid NFTs payload" });
    }

    const mapping = loadMapping();

    const metadata = nfts.map(({ address, tokenId }) => {
      const collection =
        address?.toLowerCase().includes("8cfbb04c") ? "VQLE" : "VKIN";

      const mapped = mapping[collection]?.[String(tokenId)];
      if (!mapped) {
        throw new Error(`Missing mapping for ${collection} token ${tokenId}`);
      }

      const jsonFile = mapped.token_uri || `${tokenId}.json`;
      const filePath = path.join(METADATA_JSON_DIR, collection, jsonFile);

      if (!fs.existsSync(filePath)) {
        throw new Error(`Metadata file missing for ${collection} token ${tokenId}`);
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

      const traits = {};
      for (const attr of data.attributes || []) {
        traits[attr.trait_type.toLowerCase()] = attr.value;
      }

      return {
        tokenId,
        traits: [
          Number(traits.attack),
          Number(traits.defense),
          Number(traits.vitality),
          Number(traits.agility),
          Number(traits.core),
        ],
        background: traits.background || "Unknown",
        tokenURI: `metadata/${collection}/${tokenId}`,
      };
    });

    return res.json({ metadata });
  } catch (err) {
    console.error("POST /games/validate error:", err);
    return res.status(500).json({ error: err.message || "Validation failed" });
  }
});

// ---------------- BURN TOTAL ----------------
app.get("/burn-total", (req, res) => {
  try {
    const total = readBurnTotal();
    return res.json({ totalBurnWei: total.toString() });
  } catch (err) {
    console.error("Failed to read burn total:", err);
    return res.status(500).json({ error: "Failed to read burn total" });
  }
});

// ---------------- WEEKLY LEADERBOARD HELPERS ----------------
function ensureWeeklyLeaderboardFile() {
  const weeklyDir = path.dirname(weeklyFilePath);

  if (!fs.existsSync(weeklyDir)) {
    fs.mkdirSync(weeklyDir, { recursive: true });
  }

  if (!fs.existsSync(weeklyFilePath)) {
    console.log("Weekly leaderboard file not found. Creating default...");
    fs.writeFileSync(weeklyFilePath, JSON.stringify({}), "utf8");
  }
}

function backfillWeeklyLeaderboard(games) {
  let weeklyData = {};

  if (fs.existsSync(weeklyFilePath)) {
    const raw = fs.readFileSync(weeklyFilePath, "utf8");
    weeklyData = JSON.parse(raw);
  }

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 28);
  startDate.setUTCHours(0, 0, 0, 0);

  let current = new Date(startDate);

  while (current <= now) {
    const weekStart = new Date(current);
    const weekStartTime = weekStart.getTime();
    const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;

    const weekDateKey = weekStart.toISOString().split("T")[0];

    if (weeklyData[weekDateKey]) {
      current.setDate(current.getDate() + 7);
      continue;
    }

    const weeklyGames = games.filter((g) => {
      const dateValue = g.settledAt || g.createdAt || g.date;
      if (!dateValue) return false;

      const gTime = new Date(dateValue).getTime();

      return (
        gTime >= weekStartTime &&
        gTime < weekEndTime &&
        g.settled &&
        !g.cancelled
      );
    });

    const stats = {};

    weeklyGames.forEach((g) => {
      const p1 = g.player1?.toLowerCase();
      const p2 = g.player2?.toLowerCase();
      const winner = g.winner?.toLowerCase();

      if (p1) {
        if (!stats[p1]) stats[p1] = { wins: 0, played: 0 };
        stats[p1].played += 1;
      }

      if (p2) {
        if (!stats[p2]) stats[p2] = { wins: 0, played: 0 };
        stats[p2].played += 1;
      }

      if (winner && stats[winner]) {
        stats[winner].wins += 1;
      }
    });

    const top3 = Object.entries(stats)
      .map(([address, data]) => ({
        address,
        wins: Number(data.wins),
        played: Number(data.played),
        winRate: data.played
          ? Math.round((Number(data.wins) / Number(data.played)) * 100)
          : 0,
      }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
      .slice(0, 3);

    if (top3.length > 0) {
      weeklyData[weekDateKey] = top3;
    }

    current.setDate(current.getDate() + 7);
  }

  fs.writeFileSync(weeklyFilePath, JSON.stringify(weeklyData, null, 2), "utf8");
}

// ---------------- STARTUP ----------------
try {
  if (!process.env.BACKEND_PRIVATE_KEY) {
    throw new Error("Missing BACKEND_PRIVATE_KEY environment variable");
  }

  ensureDataPaths();
  ensureWeeklyLeaderboardFile();
  initAdminWallet();
} catch (err) {
  console.error("❌ Failed to initialize backend:", err.message);
  process.exit(1);
}

// ---------------- WEEKLY LEADERBOARD BACKFILL ----------------
try {
  const allGames = readGames();
  backfillWeeklyLeaderboard(allGames);
  console.log("[SERVER] Weekly leaderboard backfill complete");
} catch (err) {
  console.error("[SERVER] Weekly leaderboard backfill failed", err);
}

// ---------------- DEBUG ROUTE LOGGING ----------------
setTimeout(() => {
  try {
    const routes = app._router?.stack
      ?.filter((r) => r.route)
      ?.map(
        (r) =>
          `${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`
      );

    console.log("✅ Mounted direct app routes:", routes || []);
  } catch (err) {
    console.error("Route logging error:", err);
  }
}, 0);

// ---------------- Backfill Leaderboard ---------- //
(async () => {
  try {
    await reconcileActiveGamesScheduled();
    await backfillWeeklyLeaderboardsFromGames(7); // current + previous 6
    console.log("[SERVER] Reconciliation + weekly backfill complete");
  } catch (err) {
    console.error("[SERVER] Startup backfill failed", err);
  }
})();

// ---------------- SCHEDULED JOBS ----------------
// Add these lock flags near your startup section
let generateMappingRunning = false;
let checkFrontendMappingRunning = false;

// Add this function somewhere below your helper functions
function startScheduledJobs() {
  console.log("[SCHEDULER] Starting scheduled NFT jobs...");

  // generateMapping every hour at minute 50
  cron.schedule("50 * * * *", async () => {
    if (generateMappingRunning) {
      console.log("[SCHEDULER] generateMapping skipped: previous run still active");
      return;
    }

    generateMappingRunning = true;
    console.log("[SCHEDULER] generateMapping started");

    try {
      await generateMapping("ALL");
      console.log("[SCHEDULER] generateMapping finished");
    } catch (err) {
      console.error("[SCHEDULER] generateMapping failed:", err);
    } finally {
      generateMappingRunning = false;
    }
  });

  // checkFrontendMapping every hour at minute 00
  cron.schedule("0 * * * *", async () => {
    if (checkFrontendMappingRunning) {
      console.log("[SCHEDULER] checkFrontendMapping skipped: previous run still active");
      return;
    }

    checkFrontendMappingRunning = true;
    console.log("[SCHEDULER] checkFrontendMapping started");

    try {
      await checkFrontendMapping();
      console.log("[SCHEDULER] checkFrontendMapping finished");
    } catch (err) {
      console.error("[SCHEDULER] checkFrontendMapping failed:", err);
    } finally {
      checkFrontendMappingRunning = false;
    }
  });
}

// Replace your existing app.listen block with this:
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  startScheduledJobs();
});