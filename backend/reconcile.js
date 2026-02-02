import { readGames, writeGames } from "./store/gamesStore.js";
import { contract } from "./routes/games.js";
import { ethers } from "ethers";

const ZERO = ethers.ZeroAddress;

export async function discoverMissingGames() {
  const games = readGames();
  const knownIds = new Set(games.map(g => g.id));

  let added = 0;

  const gamesLength = Number(await contract.gamesLength());

for (let id = 0; id < gamesLength; id++) {
  try {
    if (knownIds.has(id)) continue;

    const onChain = await contract.games(id);
    if (!onChain || onChain.player1 === ZERO) continue;

    games.push({
      id,
      player1: typeof onChain.player1 === "string" ? onChain.player1.toLowerCase() : null,
      player2: typeof onChain.player2 === "string" ? onChain.player2.toLowerCase() : null,
      stakeAmount: onChain.stakeAmount.toString(),
      stakeToken: onChain.stakeToken,
      settled: onChain.settled,
      cancelled: onChain.cancelled === true,
      winner: onChain.settled && typeof onChain.winner === "string" ? onChain.winner.toLowerCase() : null,
      player1Revealed: !!onChain.player1Revealed,
      player2Revealed: !!onChain.player2Revealed,
      createdAt: new Date().toISOString(),
    });
    added++;
  } catch (err) {
    console.error(`[DISCOVER] Failed to load on-chain game ${id}:`, err);
    continue; // skip this game
  }
}

  if (added > 0) {
    games.sort((a, b) => a.id - b.id);
    writeGames(games);
    console.log(`[DISCOVER] Added ${added} missing game(s)`);
  }

  return games;
}

export async function reconcileAllGames() {
const games = await discoverMissingGames();
  let dirty = false;

  for (const game of games) {
    const onChain = await contract.games(game.id);

    // Not terminal on-chain → ignore
    if (!onChain.settled) continue;

// Never overwrite terminal state if chain disagrees
if (game.settled === true && onChain.settled === false) {
  console.warn(`[RECONCILE] Backend settled but chain not settled for game ${game.id}`);
  continue;
}

if (game.settled && onChain.winner !== game.winner) {
  console.error(
    `[DESYNC] Game ${game.id} winner mismatch`,
    { chain: onChain.winner, backend: game.winner }
  );
}

const backendWinner = await contract.backendWinner(game.id);

    game.settled = true;
    game.settledAt = new Date().toISOString();

    if (backendWinner && backendWinner !== ZERO) {
      // Normal resolved game
      game.cancelled = false;
      game.winner = backendWinner.toLowerCase();
    } else {
      // Cancelled game (includes cancelUnjoinedGame)
      game.cancelled = true;
      game.winner = null;
    }

    dirty = true;
  }

if (!!onChain.player1Revealed && !game.player1Revealed) {
  game.player1Revealed = true;
  dirty = true;
}

if (!!onChain.player2Revealed && !game.player2Revealed) {
  game.player2Revealed = true;
  dirty = true;
}

  if (dirty) {
    writeGames(games);
    console.log("[RECONCILE] games.json updated");
  }
}
