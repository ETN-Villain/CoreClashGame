// backend/utils/handleEvent.js
import { readGames, writeGames } from "../gamesStore.js";
import { broadcast } from "../routes/events.js";
  import { deleteCache } from "../utils/ownerCache.js";

export async function handleEvent(e) {
  const games = readGames();
  const eventName = e.eventName;
  const args = e.args;

if (event.event === "Transfer") {
  const contractAddr = event.address.toLowerCase();
  const from = event.args.from?.toLowerCase();
  const to = event.args.to?.toLowerCase();

  let prefix;
  if (contractAddr === VKIN_CONTRACT_ADDRESS.toLowerCase()) {
    prefix = "vkin_owned_";
  } else if (contractAddr === VQLE_CONTRACT_ADDRESS.toLowerCase()) {
    prefix = "vqle_owned_";
  } else {
    console.warn("Transfer from unknown contract:", contractAddr);
    return;
  }

  if (from && from !== ethers.ZeroAddress) {
    deleteCache(prefix + from);
    console.log(`♻️ ${prefix.slice(0, -6)} cache invalidated for ${from}`);
  }
  if (to && to !== ethers.ZeroAddress) {
    deleteCache(prefix + to);
    console.log(`♻️ ${prefix.slice(0, -6)} cache invalidated for ${to}`);
  }
}

  if (!args || args.length === 0) return;

  const gameId = Number(args[0]);

let game = games.find(g => g.id === gameId);
if (!game) {
  game = {
    id: gameId,
    cancelled: false,
    settled: false,
    player1Reveal: null,
    player2Reveal: null,
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

    if (from && from !== ethers.ZeroAddress) {
      deleteCache(`vkin_owned_${from}`);
    }
    if (to && to !== ethers.ZeroAddress) {
      deleteCache(`vkin_owned_${to}`);
    }

    console.log("♻️ NFT ownership cache invalidated");
  }