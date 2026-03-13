import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_FILE = path.join(__dirname, "../store/weeklyLeaderboards.json");

router.get("/weekly", (req, res) => {
  try {
    if (!fs.existsSync(STORE_FILE)) return res.json({});

    const data = fs.readFileSync(STORE_FILE, "utf-8");
    const leaderboards = JSON.parse(data);

    const sortedWeeks = Object.keys(leaderboards)
      .sort((a, b) => new Date(b) - new Date(a))
      .reduce((acc, key) => {
        acc[key] = leaderboards[key];
        return acc;
      }, {});

    res.json(sortedWeeks);
  } catch (err) {
    console.error("Failed to read weekly leaderboards:", err);
    res.status(500).json({ error: "Failed to read weekly leaderboards" });
  }
});

export default router;