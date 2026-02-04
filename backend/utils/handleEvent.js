// backend/utils/handleEvent.js
import { readGames, writeGames } from "../gamesStore.js";
import { broadcast } from "../routes/events.js";
import { deleteCache } from "../utils/ownerCache.js";
import { ethers } from "ethers";
import {
  VKIN_CONTRACT_ADDRESS,
  VQLE_CONTRACT_ADDRESS
} from "../config.js";

export async function handleEvent(e) {
  const games = readGames();
  const eventName = e.eventName;
  const args = e.args;

  // ---------------- TRANSFER HANDLING ----------------
  if (eventName === "Transfer") {
    const contractAddr = e.address.toLowerCase();
    const from = args?.from?.toLowerCase();
    const to = args?.to?.toLowerCase();

    let prefix = null;

    if (contractAddr === VKIN_CONTRACT_ADDRESS.toLowerCase()) {
      prefix = "vkin_owned_";
    } else if (contractAddr === VQLE_CONTRACT_ADDRESS.toLowerCase()) {
      prefix = "vqle_owned_";
    }

    if (prefix) {
      if (from && from !== ethers.ZeroAddress) {
        deleteCache(prefix + from);
        console.log(`♻️ Cache invalidated for ${from}`);
      }

      if (to && to !== ethers.ZeroAddress) {
        deleteCache(prefix + to);
        console.log(`♻️ Cache invalidated for ${to}`);
      }
    }

    return; // Transfer handled, nothing else to do
  }

  // ---------------- GAME EVENTS ----------------
  if (!args || args.length === 0) return;

  const gameId = Number(args[0]);

  let game = games.find(g => g.id === gameId);

  if (!game) {
    game = {
      id: gameId,
      cancelled: false,
      settled: false,
      player1Revealed: false,
      player2Revealed: false,
    };
    games.push(game);
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

  broadcast(eventName, {
    gameId,
    args: args.map(a =>
      typeof a === "bigint" ? a.toString() : a
    )
  });
}
