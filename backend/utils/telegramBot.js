// backend/utils/telegramBot.js

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

// Optional: if you want messages to go into a specific forum topic/thread
const TELEGRAM_MESSAGE_THREAD_ID = process.env.TELEGRAM_MESSAGE_THREAD_ID
  ? Number(process.env.TELEGRAM_MESSAGE_THREAD_ID)
  : null;

const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

function isTelegramConfigured() {
  return !!TELEGRAM_BOT_TOKEN && !!TELEGRAM_GROUP_CHAT_ID;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function shortWallet(address) {
  if (!address || typeof address !== "string") return "Unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTokenAmount(amount, decimals = 18, maxFractionDigits = 4) {
  try {
    const raw = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;

    if (fraction === 0n) return whole.toString();

    const fractionStr = fraction
      .toString()
      .padStart(decimals, "0")
      .slice(0, maxFractionDigits)
      .replace(/0+$/, "");

    return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
  } catch {
    return String(amount);
  }
}

async function telegramRequest(method, payload = {}) {
  if (!isTelegramConfigured()) {
    throw new Error(
      "Telegram bot not configured. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_CHAT_ID."
    );
  }

  const res = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    const description =
      data?.description ||
      `Telegram API request failed with status ${res.status}`;
    throw new Error(description);
  }

  return data.result;
}

function buildFooter() {
  return (
    `\n\n━━━━━━━━━━━━━━\n` +
    `🎮 <a href="https://coreclashgame.planetzephyros.xyz">Play Core Clash</a>\n` +
    `🌍 <a href="https://planetetn.org/zephyros">Explore PlanetETN</a>`
  );
}

export async function sendTelegramGroupMessage(text, options = {}) {
  if (!isTelegramConfigured()) {
    console.warn(
      "Telegram bot not configured; skipping group message:",
      text
    );
    return null;
  }

  const payload = {
    chat_id: TELEGRAM_GROUP_CHAT_ID,
    text: text + buildFooter(),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...options,
  };

  if (TELEGRAM_MESSAGE_THREAD_ID && !payload.message_thread_id) {
    payload.message_thread_id = TELEGRAM_MESSAGE_THREAD_ID;
  }

  try {
    return await telegramRequest("sendMessage", payload);
  } catch (err) {
    console.error("sendTelegramGroupMessage failed:", err.message);
    throw err;
  }
}

export async function sendTelegramGameCreated({
  gameId,
  creator,
  stakeAmount,
  tokenLabel = "TOKEN",
}) {
  const text =
    `🎮 <b>Game #${escapeHtml(gameId)}</b> created\n` +
    `Creator: <code>${escapeHtml(shortWallet(creator))}</code>\n` +
    `Stake: <b>${escapeHtml(stakeAmount)} ${escapeHtml(tokenLabel)}</b>`;

  return sendTelegramGroupMessage(text);
}

export async function sendTelegramGameJoined({
  gameId,
  player1,
  player2,
}) {
  const text =
    `⚔️ <b>Game #${escapeHtml(gameId)}</b> joined\n` +
    `P1: <code>${escapeHtml(shortWallet(player1))}</code>\n` +
    `P2: <code>${escapeHtml(shortWallet(player2))}</code>\n` +
    `Reveal phase is now live.`;

  return sendTelegramGroupMessage(text);
}

export async function sendTelegramReveal({
  gameId,
  revealedBy,
  player1Revealed = false,
  player2Revealed = false,
}) {
  const revealCount =
    Number(!!player1Revealed) + Number(!!player2Revealed);

  const text =
    `📂 <b>Game #${escapeHtml(gameId)}</b> reveal update\n` +
    `Revealed by: <code>${escapeHtml(shortWallet(revealedBy))}</code>\n` +
    `Progress: <b>${revealCount}/2</b>`;

  return sendTelegramGroupMessage(text);
}

export async function sendTelegramBothRevealed({ gameId }) {
  const text =
    `🧮 <b>Game #${escapeHtml(gameId)}</b> both players revealed\n` +
    `Settlement is being processed.`;

  return sendTelegramGroupMessage(text);
}

export async function sendTelegramGameSettled({
  gameId,
  winner,
  tie = false,
}) {
  const text = tie
    ? `🤝 <b>Game #${escapeHtml(gameId)}</b> settled\nResult: <b>Tie</b>`
    : `🏆 <b>Game #${escapeHtml(gameId)}</b> settled\nWinner: <code>${escapeHtml(
        shortWallet(winner)
      )}</code>`;

  return sendTelegramGroupMessage(text);
}

export async function sendTelegramGameCancelled({
  gameId,
  cancelledBy,
}) {
  const text =
    `❌ <b>Game #${escapeHtml(gameId)}</b> cancelled\n` +
    `By: <code>${escapeHtml(shortWallet(cancelledBy))}</code>`;

  return sendTelegramGroupMessage(text);
}

export {
  isTelegramConfigured,
  escapeHtml,
  shortWallet,
  formatTokenAmount,
};