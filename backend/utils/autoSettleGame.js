// utils/autoSettleGame.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import { getRoundResult } from "../gameLogic.js";
import { METADATA_JSON_DIR, MAPPING_FILE } from "../paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- LOAD MAPPING ONCE ----------------
let TOKEN_URI_MAP = null;

async function loadMapping() {
  if (TOKEN_URI_MAP) return TOKEN_URI_MAP;

  TOKEN_URI_MAP = new Map();

  return new Promise((resolve, reject) => {
    fs.createReadStream(MAPPING_FILE)
      .pipe(csv({ headers: ["token_id", "token_uri"] }))
      .on("data", row => {
        TOKEN_URI_MAP.set(
          String(row.token_id).trim(),
          row.token_uri.trim()
        );
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

// ---------------- LOAD TRAITS FROM JSON ----------------
function loadTraitsFromTokenId(tokenId) {
  const tokenURI = TOKEN_URI_MAP.get(String(tokenId));

  if (!tokenURI) {
    throw new Error(`No token_uri for tokenId ${tokenId}`);
  }

  const jsonPath = path.join(METADATA_JSON_DIR, tokenURI);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Metadata file missing: ${tokenURI}`);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

  // OpenSea-style attributes
  const traits = {};
  for (const a of data.attributes || []) {
    traits[a.trait_type.toLowerCase()] = Number(a.value);
  }

  return [
    traits.attack ?? 0,
    traits.defense ?? 0,
    traits.vitality ?? 0,
    traits.agility ?? 0,
    traits.core ?? 0
  ];
}

// ---------------- MAIN SETTLEMENT ----------------
export async function autoSettleGame(game) {
  if (!game.player1 || !game.player2) {
    throw new Error("Game missing players");
  }

  if (game.settledAt) return game;

  if (!game._player1?.tokenIds || !game._player2?.tokenIds) {
    throw new Error("Missing tokenIds for settlement");
  }

  await loadMapping();

  // Load traits arrays
  const p1Traits = game._player1.tokenIds.map(loadTraitsFromTokenId);
  const p2Traits = game._player2.tokenIds.map(loadTraitsFromTokenId);

  // ---------------- COMPUTE ROUND RESULTS ----------------
  const roundResults = [];
  let player1Points = 0;
  let player2Points = 0;
  let totalDiff = 0;

  for (let i = 0; i < 3; i++) {
    const result = getRoundResult(p1Traits[i], p2Traits[i]);

    // track points
    player1Points += result.p1_wins;
    player2Points += result.p2_wins;
    totalDiff += result.round_diff;

    roundResults.push({
      round: i + 1,
      p1Total: result.p1_wins,
      p2Total: result.p2_wins,
      diff: result.round_diff,
      winner: result.p1_wins > result.p2_wins ? game.player1
             : result.p2_wins > result.p1_wins ? game.player2
             : "DRAW"
    });
  }

  // ---------------- DETERMINE GAME WINNER ----------------
  if (player1Points > player2Points) {
    game.winner = game.player1;
    game.tie = false;
  } else if (player2Points > player1Points) {
    game.winner = game.player2;
    game.tie = false;
  } else {
    // tie-breaker using totalDiff
    if (totalDiff > 0) {
      game.winner = game.player1;
      game.tie = false;
    } else if (totalDiff < 0) {
      game.winner = game.player2;
      game.tie = false;
    } else {
      game.winner = null;
      game.tie = true;
    }
  }

  game.roundResults = roundResults;
  game._resolved = { p1Traits, p2Traits };

  game.settledAt = new Date().toISOString();

  return game;
}
