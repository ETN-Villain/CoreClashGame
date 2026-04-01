// backend/routes/mapping.js
import express from "express";
import fs from "fs";
import csvParser from "csv-parser";
import { MAPPING_FILE } from "../paths.js";

const router = express.Router();

router.get("/mapping", async (req, res) => {
  try {
    if (!fs.existsSync(MAPPING_FILE)) {
      return res.status(404).json({ error: "mapping.csv not found" });
    }

    const results = {};

    fs.createReadStream(MAPPING_FILE)
      .pipe(csvParser())
      .on("data", (row) => {
        results[row.token_id] = row.token_uri;
      })
      .on("end", () => res.json(results))
      .on("error", (err) => {
        console.error("mapping.csv read error:", err);
        res.status(500).json({ error: "Failed to read mapping.csv" });
      });
  } catch (err) {
    console.error("GET /mapping error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;