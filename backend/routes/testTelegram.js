// backend/routes/testTelegram.js
import express from "express";
import { sendTelegramTestMessage } from "../utils/telegramBot.js";

const router = express.Router();

router.get("/test-telegram", async (req, res) => {
  try {
    const result = await sendTelegramTestMessage();
    res.json({ success: true, result });
  } catch (err) {
    console.error("Telegram test failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;