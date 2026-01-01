// gameLogic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAMES_FILE = path.join(__dirname, "games.json");

// Load games from file
export const loadGames = () => {
  if (!fs.existsSync(GAMES_FILE)) return [];
  return JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
};

// Save games to file
export const saveGames = (games) => {
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2));
};

// Fetch NFT metadata from IPFS
export const fetchNFT = async (tokenURI) => {
  try {
    const url = tokenURI.replace("ipfs://", "https://ipfs.io/ipfs/");
    const res = await axios.get(url);
    return res.data;
  } catch (err) {
    console.error("Failed to fetch NFT metadata:", tokenURI, err.message);
    return null;
  }
};

/**
 * Compute round result between two NFT traits
 * traits = [attack, defense, vitality, agility, core]
 */
export function getRoundResult(traits1, traits2) {
  const atk1 = traits1[0] + traits1[3]; // attack + agility
  const def1 = traits1[1] + traits1[2]; // defense + vitality
  const core1 = traits1[4];

  const atk2 = traits2[0] + traits2[3];
  const def2 = traits2[1] + traits2[2];
  const core2 = traits2[4];

  const damage1 = atk2 > def1 ? atk2 - def1 : 0;
  const mod1 = core1 > damage1 ? core1 - damage1 : 0;

  const damage2 = atk1 > def2 ? atk1 - def2 : 0;
  const mod2 = core2 > damage2 ? core2 - damage2 : 0;

  let p1_wins = 0,
      p2_wins = 0;

  // primary comparison
  if (mod1 > mod2) p1_wins = 1;
  else if (mod2 > mod1) p2_wins = 1;
  else {
    // deterministic tie-breaker: sum of attack+defense+vitality+agility
    const score1 = traits1[0] + traits1[1] + traits1[2] + traits1[3];
    const score2 = traits2[0] + traits2[1] + traits2[2] + traits2[3];

    if (score1 > score2) p1_wins = 1;
    else if (score2 > score1) p2_wins = 1;
    // else exact tie, leave p1_wins = p2_wins = 0
  }

  const round_diff = mod1 - mod2;
  return { p1_wins, p2_wins, round_diff };
}

/**
 * Compute game winner over 3 rounds
 */
/**
 * Compute game winner over 3 rounds (Option A)
 * traits1Arr and traits2Arr are arrays of 3 NFT trait arrays
 */
export function computeWinner(traits1Arr, traits2Arr) {
  let player1Points = 0;
  let player2Points = 0;
  let totalDiff = 0;

  for (let i = 0; i < 3; i++) {
    const { p1_wins, p2_wins, round_diff } = getRoundResult(
      traits1Arr[i],
      traits2Arr[i]
    );

    console.log(`Slot ${i + 1} results:`);
    console.log("  P1 traits:", traits1Arr[i]);
    console.log("  P2 traits:", traits2Arr[i]);
    console.log(`  p1_wins: ${p1_wins}, p2_wins: ${p2_wins}, round_diff: ${round_diff}`);

    player1Points += p1_wins;
    player2Points += p2_wins;
    totalDiff += round_diff;
  }

  console.log(`Total points: P1=${player1Points}, P2=${player2Points}, totalDiff=${totalDiff}`);

  if (player1Points > player2Points) return "player1";
  if (player2Points > player1Points) return "player2";
  if (totalDiff > 0) return "player1";
  if (totalDiff < 0) return "player2";

  console.log("Final outcome: tie");
  return "tie";
}

/**
 * Resolve a single game using NFT metadata
 * Populates winner, tie
 */
export const resolveGame = async (game) => {
  if (!game.player2) return null;
  if (!game._player1?.tokenURIs || !game._player2?.tokenURIs) return null;

  const traits1 = [];
  for (let i = 0; i < 3; i++) {
    const nftData = await fetchNFT(game._player1.tokenURIs[i]);
    if (!nftData) {
      console.error("Missing metadata for P1 token", game._player1.tokenURIs[i]);
      return null;
    }

    traits1.push([
      nftData.traits1[0],
      nftData.traits1[1],
      nftData.traits1[2],
      nftData.traits1[3],
      nftData.traits1[4],
    ]);
  }

  const traits2 = [];
  for (let i = 0; i < 3; i++) {
    const nftData = await fetchNFT(game._player2.tokenURIs[i]);
    if (!nftData) {
      console.error("Missing metadata for P2 token", game._player2.tokenURIs[i]);
      return null;
    }

    traits2.push([
      nftData.traits2[0],
      nftData.traits2[1],
      nftData.traits2[2],
      nftData.traits2[3],
      nftData.traits2[4],
    ]);
  }

  const winnerKey = computeWinner(traits1, traits2);

  if (winnerKey === "tie") {
    game.winner = null;
    game.tie = true;
  } else {
    game.winner = game[winnerKey];
    game.tie = false;
  }

  game.settledAt = new Date().toISOString();
  return game;
};

/**
 * Resolve all pending games
 */
export const resolveAllGames = async () => {
  const games = loadGames();
  let changed = false;

  for (const game of games) {
    // Only resolve games that have both players and are not yet settled
    if (!game.player2 || game.settledAt) continue;

    // Only resolve if all tokenURIs exist
    if (!game._player1?.tokenURIs || !game._player2?.tokenURIs) continue;

    const result = await resolveGame(game);
    if (result) changed = true;
  }

  if (changed) saveGames(games);
};