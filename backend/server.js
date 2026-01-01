import express from "express";
import cors from "cors"; // ✅ import cors
import fs from "fs";
import path from "path";
import { generateMapping } from "./utils/generateMapping.js";
import gamesRouter from "./routes/games.js";
import { METADATA_JSON_DIR, REVEAL_DIR } from "../backend/paths.js";

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(cors({ origin: "http://localhost:3000" })); // allow requests from your React app
app.use(express.json());

// ---------------- ROUTES ----------------
app.use("/games", gamesRouter);

// ---------------- INIT ----------------
await generateMapping();
app.listen(3001, () => console.log("Backend running"));

// GET metadata for a tokenId
app.get("/metadata/:tokenId", (req, res) => {
  const { tokenId } = req.params;
  const mapping = loadMapping(); // from your existing paths.js
  const jsonFile = mapping[tokenId];
  if (!jsonFile) return res.status(404).json({ error: "Token not found" });

  const filePath = path.join(METADATA_JSON_DIR, jsonFile);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "File missing" });

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  res.json(data);
});

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

// GET /reveal-backup/:gameId/:account
app.get("/reveal-backup/:gameId/:account", (req, res) => {
  try {
    const { gameId, account } = req.params;
    const filePath = path.join(REVEAL_DIR, `${gameId}_${account}.json`);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Reveal backup not found" });

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});