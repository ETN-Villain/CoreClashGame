// backend/utils/handleEvent.js
import { readGames, writeGames } from "../routes/games.js";
import { broadcast } from "../routes/events.js";

export async function handleEvent(e) {
  const games = readGames();

  const eventName = e.eventName;
  const args = e.args;

  if (!args || args.length === 0) return;

  const gameId = Number(args[0]);

  let game = games.find(g => g.id === gameId);
  if (!game) {
    game = {
      id: gameId,
      cancelled: false,
      settled: false,
      _reveal: {}
    };
    games.push(game);
  }

if (!game) {
  console.warn(`⚠ Event for unknown game ${id} ignored`);
  return;
}

switch (eventName) {
    case "GameCreated": {
      const player1 = args[1];
      if (!player1) break;

      game.player1 = player1.toLowerCase();
      game.createdAt = new Date().toISOString();
      break;
    }

    case "GameJoined": {
      const player2 = args[1];
      if (!player2) break;

      game.player2 = player2.toLowerCase();
      game.player2JoinedAt = new Date().toISOString();
      break;
    }

    case "GameCancelled": {
      game.cancelled = true;
      game.cancelledAt = new Date().toISOString();
      break;
    }

    case "GameSettled": {
      const winner = args[1];
      if (!winner) break;

      game.settled = true;
      game.winner = winner.toLowerCase();
      game.settledAt = new Date().toISOString();
      break;
    }

    default:
      return;
  }

  writeGames(games);

  // 🔔 Push to frontend
  broadcast(eventName, {
    gameId,
    args: args.map(a =>
      typeof a === "bigint" ? a.toString() : a
    )
  });
}
