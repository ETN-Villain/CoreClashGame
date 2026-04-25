import { readGames } from "../store/gamesStore.js";
import { saveWeeklyLeaderboard } from "../store/weeklyLeaderboardStore.js";
import { awardWeeklyLeaderboardBonuses } from "../utils/playerXp.js";

function getWeekStartUTC(dateInput) {
  const d = new Date(dateInput);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);

  return d;
}

export async function rebuildWeeklyLeaderboardForDate(dateInput) {
  const games = readGames();
  const weekStart = getWeekStartUTC(dateInput);
  const weekStartTime = weekStart.getTime();
  const weekEndTime = weekStartTime + 7 * 24 * 60 * 60 * 1000;
  const weekKey = weekStart.toISOString().split("T")[0];

  const weeklyGames = games.filter((g) => {
    const dateValue = g.settledAt || g.createdAt || g.date;
    if (!dateValue) return false;

    const t = new Date(dateValue).getTime();

    return (
      t >= weekStartTime &&
      t < weekEndTime &&
      g.settled === true &&
      g.cancelled !== true
    );
  });

  const stats = {};

  for (const g of weeklyGames) {
    const p1 = g.player1?.toLowerCase();
    const p2 = g.player2?.toLowerCase();
    const winner = g.winner?.toLowerCase();

    if (p1) {
      if (!stats[p1]) stats[p1] = { wins: 0, played: 0 };
      stats[p1].played += 1;
    }

    if (p2) {
      if (!stats[p2]) stats[p2] = { wins: 0, played: 0 };
      stats[p2].played += 1;
    }

    if (winner && stats[winner]) {
      stats[winner].wins += 1;
    }
  }

  const top3 = Object.entries(stats)
    .map(([address, data]) => ({
      address,
      wins: Number(data.wins),
      played: Number(data.played),
      winRate: data.played
        ? Math.round((Number(data.wins) / Number(data.played)) * 100)
        : 0,
    }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
    .slice(0, 3);

  await saveWeeklyLeaderboard(weekKey, top3);
  awardWeeklyLeaderboardBonuses(weekKey, top3);

  return { weekKey, top3 };
}