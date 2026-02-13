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

export const fetchNFT = async (collection, tokenId) => {
  try {
    const mapping = loadMapping();

    const mapped = mapping[collection]?.[String(tokenId)];
    if (!mapped) {
      throw new Error(`Token ${tokenId} not found in mapping`);
    }

    const jsonFile = mapped.token_uri || `${tokenId}.json`;
    const filePath = path.join(METADATA_JSON_DIR, collection, jsonFile);

    console.log(`Loading metadata: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Metadata file missing: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);

  } catch (err) {
    console.error("Failed to fetch NFT metadata:", collection, tokenId, err.message);
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
  // ---- Basic validation ----
  if (!game.player1 || !game.player2) return null;

  if (!game.player1Reveal || !game.player2Reveal) {
    console.warn("Missing reveal data");
    return null;
  }

  const {
    tokenIds: p1TokenIds,
    nftContracts: p1Contracts,
    tokenURIs: p1Uris,
    backgrounds: p1Backgrounds = [],
  } = game.player1Reveal;

  const {
    tokenIds: p2TokenIds,
    nftContracts: p2Contracts,
    tokenURIs: p2Uris,
    backgrounds: p2Backgrounds = [],
  } = game.player2Reveal;

  // ---- Hard guard: reveal structure ----
  if (
    !Array.isArray(p1TokenIds) ||
    !Array.isArray(p2TokenIds) ||
    !Array.isArray(p1Contracts) ||
    !Array.isArray(p2Contracts) ||
    !Array.isArray(p1Uris) ||
    !Array.isArray(p2Uris)
  ) {
    throw new Error("Invalid reveal data structure");
  }

  console.log("Resolving game:", {
    id: game.id,
    p1Tokens: p1TokenIds,
    p2Tokens: p2TokenIds,
  });

  const traits1 = [];
  const traits2 = [];

  // ---- Trait extraction helper ----
  const extractTraits = (nftData) => {
    const findValue = (name) => {
      const trait = nftData.attributes?.find(
        (a) => a.trait_type?.toLowerCase() === name.toLowerCase()
      );
      return trait ? Number(trait.value) : 0;
    };

    return [
      findValue("Attack"),
      findValue("Defense"),
      findValue("Vitality"),
      findValue("Agility"),
      findValue("CORE"),
    ];
  };

  // ---- Player 1 ----
  for (let i = 0; i < 3; i++) {
    const tokenId = p1TokenIds[i];
    const contractAddr = p1Contracts[i]?.toLowerCase() || "";
    const collection = addressToCollection[contractAddr] || "VKIN";

    console.log(`P1 token ${i}: ${collection} ${tokenId} → ${uri}`);

    const nftData = await fetchNFT(collection, tokenId);

    if (!nftData) {
      console.error("Missing metadata for P1 token", uri);
      return null;
    }

    traits1.push(extractTraits(nftData));
  }

  // ---- Player 2 ----
  for (let i = 0; i < 3; i++) {
    const tokenId = p2TokenIds[i];
    const contractAddr = p2Contracts[i]?.toLowerCase() || "";
    const collection = addressToCollection[contractAddr] || "VKIN";
    const uri = p2Uris[i];

    console.log(`P2 token ${i}: ${collection} ${tokenId} → ${uri}`);

    const nftData = await fetchNFT(collection, tokenId);

    if (!nftData) {
      console.error("Missing metadata for P2 token", uri);
      return null;
    }

    traits2.push(extractTraits(nftData));
  }

  // ---- Compute winner ----
  const { winner, roundResults } = computeWinner(traits1, traits2);

  const winnerAddress =
    winner === "tie"
      ? null
      : winner === "player1"
      ? game.player1
      : game.player2;

  // ---- Persist result ----
  game.roundResults = roundResults;
  game.winner = winnerAddress;
  game.tie = winner === "tie";
  game.settledAt = new Date().toISOString();

  console.log("Game resolved:", {
    gameId: game.id,
    winner: game.winner,
    tie: game.tie,
    rounds: roundResults.length,
  });

  return game;
}
