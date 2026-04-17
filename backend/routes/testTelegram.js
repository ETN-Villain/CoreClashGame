// backend/routes/testTelegram.js
import express from "express";
import {
  sendTelegramTestMessage,
  getTelegramUpdates,
} from "../utils/telegramBot.js";

const router = express.Router();

router.get("/test-telegram", async (req, res) => {
  try {
    const result = await sendTelegramTestMessage();

    if (!result) {
      return res.status(500).json({
        success: false,
        error: "Telegram send failed. Check /admin/telegram-updates and Render logs.",
      });
    }

    res.json({ success: true, result });
  } catch (err) {
    console.error("Telegram test failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/telegram-updates", async (req, res) => {
  try {
    const updates = await getTelegramUpdates();
    res.json({ success: true, updates });
  } catch (err) {
    console.error("Telegram updates failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;