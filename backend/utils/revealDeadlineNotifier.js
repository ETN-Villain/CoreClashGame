import { withLock } from "../utils/mutex.js";
import { readGames, writeGames } from "../store/gamesStore.js";
import {
  sendTelegramRevealDeadlineSoon,
  sendTelegramRevealDeadlinePassed,
} from "../utils/telegramBot.js";

const REVEAL_WINDOW_MS = 5 * 24 * 60 * 60 * 1000; // 5 days
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getRevealDeadline(game) {
  const base =
    game.player2JoinedAt ||
    game.joinedAt ||
    game.updatedAt ||
    game.createdAt ||
    game.date;

  if (!base) return null;

  const t = new Date(base).getTime();
  if (Number.isNaN(t)) return null;

  return new Date(t + REVEAL_WINDOW_MS);
}

function hasMissingReveal(game) {
  return !game.player1Reveal || !game.player2Reveal;
}

export async function processRevealDeadlineNotifications() {
  const now = Date.now();
  const soonThresholdStart = now - 10 * 60 * 1000; // allow some scheduler drift
  const soonThresholdEnd = now + 10 * 60 * 1000;

  const pendingMessages = [];

  await withLock(async () => {
    const games = readGames();
    let changed = false;

    for (const game of games) {
      if (!game || game.cancelled || game.settled) continue;
      if (!hasMissingReveal(game)) continue;

      const deadline = getRevealDeadline(game);
      if (!deadline) continue;

      const deadlineMs = deadline.getTime();
      const oneDayBeforeMs = deadlineMs - ONE_DAY_MS;

      // 1-day warning
      if (
        !game.telegramRevealDeadlineSoonSent &&
        oneDayBeforeMs >= soonThresholdStart &&
        oneDayBeforeMs <= soonThresholdEnd
      ) {
        pendingMessages.push({
          type: "soon",
          gameId: game.id,
          player1: game.player1,
          player2: game.player2,
          deadlineAt: deadline.toISOString(),
        });

        game.telegramRevealDeadlineSoonSent = true;
        game.telegramRevealDeadlineSoonSentAt = new Date().toISOString();
        changed = true;
      }

      // deadline passed
      if (!game.telegramRevealDeadlinePassedSent && deadlineMs <= now) {
        pendingMessages.push({
          type: "passed",
          gameId: game.id,
          player1: game.player1,
          player2: game.player2,
          deadlineAt: deadline.toISOString(),
        });

        game.telegramRevealDeadlinePassedSent = true;
        game.telegramRevealDeadlinePassedSentAt = new Date().toISOString();
        changed = true;
      }
    }

    if (changed) {
      writeGames(games);
    }
  });

  for (const msg of pendingMessages) {
    try {
      if (msg.type === "soon") {
        await sendTelegramRevealDeadlineSoon(msg);
      } else if (msg.type === "passed") {
        await sendTelegramRevealDeadlinePassed(msg);
      }
    } catch (err) {
      console.error(
        `[REVEAL DEADLINE] Failed to send ${msg.type} Telegram message for game ${msg.gameId}:`,
        err.message || err
      );
    }
  }

  return {
    success: true,
    sent: pendingMessages.length,
  };
}