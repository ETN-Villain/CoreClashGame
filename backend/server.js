import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readOwnerCache, writeOwnerCache } from "./utils/ownerCache.js";
import { initAdminWallet } from "./admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//import { generateMapping } from "./utils/generateMapping.js";
import { loadMapping, METADATA_JSON_DIR } from "./paths.js";

import gamesRouter from "./routes/games.js";
import sseRouter from "./routes/sse.js";
import nftsRouter from "./routes/nfts.js";
import { reconcileActiveGamesScheduled } from "./reconcile.js";
import "./eventListener.js";

const app = express();
const GAMES_FILE = path.join(__dirname, "games", "games.json");
const weeklyFilePath = path.join(__dirname, "store", "weeklyLeaderboards.json");

// ---------------- MIDDLEWARE ----------------
app.use(cors({
  origin: [
    "https://coreclashgame.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
}));

app.use(express.json());

// ---------------- ROUTES ----------------
app.use("/games", gamesRouter);
app.use("/leaderboard", gamesRouter);
app.use("/events", sseRouter);
app.use("/nfts", nftsRouter);

// ---------------- METADATA ----------------
app.get("/metadata/:collection/:tokenId", (req, res) => {
  const { collection, tokenId } = req.params;
  const mapping = loadMapping(); // your load function

  const mapped = mapping[collection.toUpperCase()]?.[String(tokenId)];
  if (!mapped) {
    return res.status(404).json({ error: "Token not found in mapping" });
  }

  // Prefer image_file if present
  const jsonFile = mapped.token_uri || `${tokenId}.json`;
  const imageFile = mapped.image_file || `${tokenId}.png`;

  const filePath = path.join(METADATA_JSON_DIR, collection.toUpperCase(), jsonFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Metadata file missing" });
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  res.json({
    ...data,
    image_file: imageFile, // expose to frontend if needed
  });
});

// ---------------- START SERVER ----------------
//await generateMapping();

const PORT = 3001;

try {
  initAdminWallet();
} catch (err) {
  console.error("❌ Failed to initialize admin wallet:", err.message);
  process.exit(1); // hard fail — backend must not run without admin
}

app.listen(PORT, () => {
  console.log(`🚀 Backend server running at https://coreclashgame.onrender.com:${PORT}`);
});

/* ---------- RECONCILE GAMES WITH CHAIN --------*/
(async () => {
  try {
    await reconcileActiveGamesScheduled();
    console.log("[SERVER] Reconciliation complete");
  } catch (err) {
    console.error("[SERVER] Reconciliation failed", err);
  }
})();

// ---------------- DEBUG ROUTE LOGGING ----------------
console.log("✅ games.js router loaded");

// log mounted routes AFTER registration
setTimeout(() => {
  console.log(
    app._router.stack
      .filter(r => r.route)
      .map(
        r =>
          Object.keys(r.route.methods)[0].toUpperCase() +
          " " +
          r.route.path
      )
  );
}, 0);

// ---------------- ROUTES ----------------
console.log("✅ games.js router loaded");
console.log(
  app._router.stack
    .filter(r => r.route)
    .map(r => Object.keys(r.route.methods)[0].toUpperCase() + " " + r.route.path)
);

// POST endpoint for validation
app.post("/games/validate", (req, res) => {
  const { nfts } = req.body; // [{ address, tokenId }]
  const metadata = nfts.map(({ tokenId }) => {
    const mapping = loadMapping();
    const file = mapping[tokenId];
    const data = JSON.parse(fs.readFileSync(path.join(METADATA_JSON_DIR, file)));
    // return only needed fields
    const traits = {};
    data.attributes.forEach(a => {
      traits[a.trait_type.toLowerCase()] = a.value;
    });
    return {
      tokenId,
      traits: [
        Number(traits.attack),
        Number(traits.defense),
        Number(traits.vitality),
        Number(traits.agility),
        Number(traits.core)
      ],
      background: traits.background || "Unknown",
      tokenURI: `metadata/${tokenId}`
    };
  });

  res.json({ metadata });
});

app.use(
  "/images",
  express.static(
    path.join(__dirname, "metadata-cache/images")
  )
);

app.get("/games", (req, res) => {
  try {
    const raw = fs.readFileSync(GAMES_FILE, "utf8");
    const games = JSON.parse(raw);
    res.json(games);
  } catch (err) {
    console.error("Failed to read games.json", err);
    res.status(500).json({ error: "Failed to load games" });
  }
});

// Endpoint to return burn total
app.get("/burn-total", (req, res) => {
  try {
    const total = readBurnTotal(); // should return BigInt
    res.json({ totalBurnWei: total.toString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to read burn total" });
  }
});

console.log("Owner cache file path will be:", path.join(__dirname, "cache/owners.json"));

// 1️⃣ Initialize file if missing
function initializeWeeklyLeaderboard() {
  if (!fs.existsSync(weeklyFilePath)) {
    console.log("Weekly leaderboard file not found. Creating default...");
    fs.writeFileSync(weeklyFilePath, JSON.stringify({}), "utf8");
  }
}

// 2️⃣ Backfill top 3 for past weeks
function backfillWeeklyLeaderboard(games) {
  const weeklyData = fs.existsSync(weeklyFilePath)
    ? JSON.parse(fs.readFileSync(weeklyFilePath, "utf8"))
    : {};

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 28); // backfill last 4 weeks
  startDate.setUTCHours(0, 0, 0, 0);

  let current = new Date(startDate);

  while (current <= now) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weeklyGames = games.filter((g) => {
      const gTime = new Date(g.date).getTime();
      return gTime >= weekStart.getTime() && gTime <= weekEnd.getTime() && g.settled && !g.cancelled;
    });

    if (weeklyGames.length > 0) {
      const stats = {};
      weeklyGames.forEach((g) => {
        const p1 = g.player1?.toLowerCase();
        const p2 = g.player2?.toLowerCase();
        const winner = g.winner?.toLowerCase();
        const isTie = g.tie;

        [p1, p2].forEach((player) => {
          if (!player || player === "0x0000000000000000000000000000000000000000") return;
          if (!stats[player]) stats[player] = { wins: 0, played: 0 };
          stats[player].played += 1;
        });

        if (!isTie && winner && winner !== "0x0000000000000000000000000000000000000000") {
          if (!stats[winner]) stats[winner] = { wins: 0, played: 0 };
          stats[winner].wins += 1;
        }
      });

      const top3 = Object.entries(stats)
        .map(([address, data]) => ({
          address,
          wins: data.wins,
          played: data.played,
          winRate: data.played > 0 ? Math.round((data.wins / data.played) * 100) : 0,
        }))
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.winRate - a.winRate;
        })
        .slice(0, 3);

      const weekDateKey = weekStart.toISOString().split("T")[0];
        weeklyData[weekDateKey] = top3;
    }

    current.setDate(current.getDate() + 7);
  }

  fs.writeFileSync(weeklyFilePath, JSON.stringify(weeklyData, null, 2), "utf8");
  console.log("Weekly leaderboard backfilled!");
}

// 3️⃣ Run on server startup
initializeWeeklyLeaderboard();

const games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
backfillWeeklyLeaderboard(games);