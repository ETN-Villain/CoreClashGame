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
    res.json({ success: true, result });
  } catch (err) {
    console.error("Telegram test failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Telegram test failed",
    });
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

router.get("/test-game-created", async (req, res) => {
  try {
    const result = await sendTelegramGameCreated({
      gameId: 9999,
      creator: "0x1234567890abcdef1234567890abcdef12345678",
      stakeAmount: "10.00",
      tokenLabel: "CORE",
    });

    res.json({ success: true, result });
  } catch (err) {
    console.error("Telegram game-created test failed:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Telegram game-created test failed",
    });
  }
});

export default router;