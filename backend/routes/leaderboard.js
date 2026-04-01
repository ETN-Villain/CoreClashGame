import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORE_FILE = path.join(__dirname, "../store/weeklyLeaderboards.json");

// Ensure file exists
if (!fs.existsSync(STORE_FILE)) {
  fs.writeFileSync(STORE_FILE, JSON.stringify({}));
}

// SAVE WEEKLY
router.post("/weekly", async (req, res) => {
  try {
    const { weekStart, top3 } = req.body;

    if (!weekStart || !Array.isArray(top3) || top3.length === 0) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const weekDate = new Date(weekStart).toISOString().split("T")[0];

    await saveWeeklyLeaderboard(weekDate, top3);

    return res.json({ message: "Weekly leaderboard saved" });
  } catch (err) {
    console.error("Error saving weekly leaderboard:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET ALL WEEKS
router.get("/weekly", async (req, res) => {
  try {
    const sortedWeeks = await getWeeklyLeaderboardsSorted();
    return res.json(sortedWeeks);
  } catch (err) {
    console.error("Failed to read weekly leaderboards:", err);
    return res.status(500).json({ error: "Failed to read weekly leaderboards" });
  }
});

export default router;