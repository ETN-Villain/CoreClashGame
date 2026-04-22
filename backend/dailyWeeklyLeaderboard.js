import { sendTelegramWeeklyLeaderboard } from "../utils/telegramBot.js";

const TARGET_HOUR_UTC = 18;
const TARGET_MINUTE_UTC = 0;
const TARGET_SECOND_UTC = 0;

function msUntilNextRun() {
  const now = new Date();

  const next = new Date(now);
  next.setUTCHours(TARGET_HOUR_UTC, TARGET_MINUTE_UTC, TARGET_SECOND_UTC, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.getTime() - now.getTime();
}

export function startDailyWeeklyLeaderboardJob() {
  async function scheduleNext() {
    const delay = msUntilNextRun();

    const nextRun = new Date(Date.now() + delay);
    console.log(
      `⏰ Weekly leaderboard job scheduled for ${nextRun.toISOString()}`
    );

    setTimeout(async () => {
      try {
        console.log("📤 Sending daily weekly leaderboard to Telegram...");
        await sendTelegramWeeklyLeaderboard();
        console.log("✅ Daily weekly leaderboard sent");
      } catch (err) {
        console.error("❌ Daily weekly leaderboard job failed:", err);
      } finally {
        scheduleNext();
      }
    }, delay);
  }

  scheduleNext();
}