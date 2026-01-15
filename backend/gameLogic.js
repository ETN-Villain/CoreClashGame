// gameLogic.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const GAMES_FILE = path.join(__dirname, "games", "games.json");

// loadGames
export const loadGames = () => {
  if (!fs.existsSync(GAMES_FILE)) return [];
  try {
    const games = JSON.parse(fs.readFileSync(GAMES_FILE, "utf8"));
    return games.map(g => ({
      ...g,
      id: Number(g.id),
      _reveal: g._reveal ?? { player1: null, player2: null },
      cancelled: Boolean(g.cancelled),
      settled: Boolean(g.settled),
    }));
  } catch {
    return [];
  }
};

// saveGames
export const saveGames = (games) => {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(GAMES_FILE), { recursive: true });

  // Write the file
  fs.writeFileSync(GAMES_FILE, JSON.stringify(games, null, 2), "utf8");
  console.log("💾 Games saved:", GAMES_FILE, "Total games:", games.length);
};

// Fetch NFT metadata from IPFS
const METADATA_CACHE = path.join(__dirname, "metadata-cache", "json");

// Fetch NFT metadata from local cache
export const fetchNFT = async (tokenURI) => {
  try {
    // tokenURI may be just a filename like "378.json"
    const filePath = path.join(METADATA_CACHE, tokenURI);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
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

  const roundResults = [];

  for (let i = 0; i < 3; i++) {
    const { p1_wins, p2_wins, round_diff } = getRoundResult(
      traits1Arr[i],
      traits2Arr[i]
    );

    player1Points += p1_wins;
    player2Points += p2_wins;
    totalDiff += round_diff;

    roundResults.push({
      round: i + 1,
      winner:
        p1_wins ? "player1" :
        p2_wins ? "player2" :
        "tie",
      diff: round_diff
    });
  }

  let winner = "tie";
  if (player1Points > player2Points) winner = "player1";
  else if (player2Points > player1Points) winner = "player2";
  else if (totalDiff > 0) winner = "player1";
  else if (totalDiff < 0) winner = "player2";

  return { winner, roundResults };
}

/**
 * Resolve a single game using NFT metadata
 * Populates winner, tie
 */
export const resolveGame = async (game) => {
  if (!game.player2) return null;
  if (!game._reveal?.player1?.tokenURIs || !game._reveal?.player2?.tokenURIs) return null;

  const traits1 = [];
  const traits2 = [];

  // Helper to extract traits from attributes array
  const extractTraits = (nftData) => {
    const findValue = (name) => {
      const trait = nftData.attributes.find(a => a.trait_type.toLowerCase() === name.toLowerCase());
      return trait ? Number(trait.value) : 0;
    };
    return [
      findValue("Attack"),
      findValue("Defense"),
      findValue("Vitality"),
      findValue("Agility"),
      findValue("CORE")
    ];
  };

  // Player 1 traits
  for (let i = 0; i < 3; i++) {
    const nftData = await fetchNFT(game._reveal.player1.tokenURIs[i]);
    if (!nftData) {
      console.error("Missing metadata for P1 token", game._reveal.player1.tokenURIs[i]);
      return null;
    }
    traits1.push(extractTraits(nftData));
  }

  // Player 2 traits
  for (let i = 0; i < 3; i++) {
    const nftData = await fetchNFT(game._reveal.player2.tokenURIs[i]);
    if (!nftData) {
      console.error("Missing metadata for P2 token", game._reveal.player2.tokenURIs[i]);
      return null;
    }
    traits2.push(extractTraits(nftData));
  }

  // Compute winner
const { winner, roundResults } = computeWinner(traits1, traits2);

game.roundResults = roundResults;

if (winner === "tie") {
  game.winner = null;
  game.tie = true;
} else {
  game.winner = game[winner];
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