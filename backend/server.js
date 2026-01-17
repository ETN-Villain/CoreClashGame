import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readOwnerCache, writeOwnerCache } from "./utils/ownerCache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateMapping } from "./utils/generateMapping.js";
import { loadMapping, METADATA_JSON_DIR } from "./paths.js";

import gamesRouter from "./routes/games.js";
import sseRouter from "./routes/sse.js";
import nftsRouter from "./routes/nfts.js";

const app = express();
const GAMES_FILE = path.join(__dirname, "games", "games.json");

// ---------------- MIDDLEWARE ----------------
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// ---------------- ROUTES ----------------
app.use("/games", gamesRouter);
app.use("/events", sseRouter);
app.use("/nfts", nftsRouter);

// ---------------- METADATA ----------------
app.get("/metadata/:tokenId", (req, res) => {
  const { tokenId } = req.params;

  const mapping = loadMapping();
  const jsonFile = mapping[tokenId];
  if (!jsonFile) {
    return res.status(404).json({ error: "Token not found" });
  }

  const filePath = path.join(METADATA_JSON_DIR, jsonFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File missing" });
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  res.json(data);
});

// ---------------- START SERVER ----------------
await generateMapping();

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
});

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
  express.static("metadata-cache/images", {
    maxAge: "365d",
    immutable: true,
  })
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

console.log("Owner cache file path will be:", path.join(__dirname, "cache/owners.json"));