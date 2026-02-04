// gameLogic.js
import axios from "axios";
import { METADATA_JSON_DIR } from "./paths.js";
import fs from "fs";
import path from "path";
import tokenMapping from "../src/mapping.json" assert { type: "json" };

// Helper to map tokenId → tokenURI from mapping.json
function tokenIdToTokenURI(collection, tokenId) {
  const collectionMap = tokenMapping[collection];
  if (!collectionMap) {
    throw new Error(`No mapping for collection ${collection}`);
  }

  const entry = collectionMap[String(tokenId)];
  if (!entry || !entry.token_uri) {
    throw new Error(
      `No token_uri mapping for ${collection} tokenId ${tokenId}`
    );
  }

  return entry.token_uri;
}

// Ensure lowercase keys (matches .toLowerCase() usage)
const addressToCollection = {
  "0x3fc7665b1f6033ff901405cddf31c2e04b8a2ab4": "VKIN",
  "0x8cfbb04c54d35e2e8471ad9040d40d73c08136f0": "VQLE",
};

// Fetch NFT metadata from local cache
export const fetchNFT = async (collection, tokenURI) => {
  try {
    // collection = "VKIN" or "VQLE"
    const filePath = path.join(METADATA_JSON_DIR, collection, tokenURI);

    console.log(`Trying to load metadata: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to fetch NFT metadata:", collection, tokenURI, err.message);
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
export async function resolveGame(game) {
  console.log("Resolving game:", {
    id: game.id,
    roundResults: game.roundResults,
    player1Backgrounds: game.player1Backgrounds,
    player2Backgrounds: game.player2Backgrounds,
  });

  if (!game.player2) return null;
if (!game.player1Reveal || !game.player2Reveal) {
  console.warn("Missing reveal data");
  return null;
}

  const traits1 = [];
  const traits2 = [];

  // Helper to extract traits from attributes array
const extractTraits = (nftData) => {
    const findValue = (name) => {
      const trait = nftData.attributes?.find(a => a.trait_type?.toLowerCase() === name.toLowerCase());
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
  const tokenId = game.player1Reveal.nftIds[i];
  const contractAddr = game.player1Reveal.nftContracts[i]?.toLowerCase() || "";
  const collection = addressToCollection[contractAddr] || "VKIN";

  const uri = tokenIdToTokenURI(collection, tokenId);

  console.log(`P1 token ${i}: tokenId ${tokenId} → ${uri} in ${collection}`);

  const nftData = await fetchNFT(collection, uri);
  if (!nftData) {
    console.error("Missing metadata for P1 token", uri, "in", collection);
    return null;
  }
  traits1.push(extractTraits(nftData));
}

// Player 2 traits (same pattern)
for (let i = 0; i < 3; i++) {
  const tokenId = game.player2Reveal.nftIds[i];
  const contractAddr = game.player2Reveal.nftContracts[i]?.toLowerCase() || "";
  const collection = addressToCollection[contractAddr] || "VKIN";

  const uri = tokenIdToTokenURI(collection, tokenId);

  console.log(`P2 token ${i}: tokenId ${tokenId} → ${uri} in ${collection}`);

  const nftData = await fetchNFT(collection, uri);
  if (!nftData) {
    console.error("Missing metadata for P2 token", uri, "in", collection);
    return null;
  }
  traits2.push(extractTraits(nftData));
}

// Compute winner
const { winner, roundResults } = computeWinner(traits1, traits2);

// Map winner string ("player1"/"player2"/"tie") → Ethereum address
const winnerAddress = winner === "tie"
  ? null
  : winner === "player1"
    ? game.player1
    : game.player2;

// Update game object
game.roundResults = roundResults;
game.winner = winnerAddress;     // store actual address
game.tie = winner === "tie";
game.settledAt = new Date().toISOString();

console.log("Game resolved:", {
  winner: game.winner,
  tie: game.tie,
  roundResults: game.roundResults
});

return game;
}