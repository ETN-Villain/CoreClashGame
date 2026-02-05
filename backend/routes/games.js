import express from "express";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { Wallet, ethers } from "ethers";
import { fileURLToPath } from "url";
import { METADATA_JSON_DIR, REVEAL_DIR, MAPPING_FILE, loadMapping } from "../paths.js";
import { RPC_URL, BACKEND_PRIVATE_KEY, GAME_ADDRESS, 
  VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "../config.js";
import GameABI from "../../src/abis/GameABI.json" assert { type: "json" };
import { readGames, writeGames } from "../store/gamesStore.js";
import { resolveGame } from "../gameLogic.js";
import { fetchOwnedTokenIds } from "../utils/nftUtils.js";
import { readOwnerCache, writeOwnerCache } from "../utils/ownerCache.js";
import { reconcileAllGamesScheduled } from "../reconcile.js";
import { broadcast } from "./sse.js";
import { adminContract, adminWalletReady } from "../admin.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_URI_MAP = loadTokenURIMapping();
const GAMES_FILE = path.join(process.cwd(), "games", "games.json");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
export const contract = new ethers.Contract(
  GAME_ADDRESS,
  GameABI,
  adminWallet // 🔐 ADMIN signer
);

// ---------------- HELPERS ----------------
function loadTokenURIMapping() {
  if (!fs.existsSync(MAPPING_FILE)) return {};
  const csv = fs.readFileSync(MAPPING_FILE, "utf8");
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const map = {};
  for (const r of records) map[Number(r.token_id)] = r.token_uri;
  return map;
}


// GET /games — list all games, wallet-agnostic
router.get("/", async (req, res) => {
  try {
    const backendGames = readGames(); // load from games.json
    const readProvider = new ethers.JsonRpcProvider(RPC_URL); // public provider
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, readProvider);

    const onChainGames = [];
    let i = 0;

const gameCount = Number(await contract.gamesLength());

for (let i = 0; i < gameCount; i++) {
  const g = await contract.games(i);
        onChainGames.push({
          id: i,
          player1: g.player1,
          player2: g.player2,
          stakeAmount: g.stakeAmount.toString(),
          stakeToken: g.stakeToken,
          settled: g.settled,
          winner: g.winner,
          player1Revealed: g.player1Revealed,
          player2Revealed: g.player2Revealed,
          cancelled: g.cancelled || false,
        });
    }

// Merge backend games — backend overrides computed fields
const merged = onChainGames.map(oc => {
  const backend = backendGames.find(bg => bg.id === oc.id);

  return {
    id: oc.id,

    // players & stake — always chain
    player1: oc.player1,
    player2: oc.player2,
    stakeAmount: oc.stakeAmount,
    stakeToken: oc.stakeToken,

    // reveal status — backend assists, chain confirms
    player1Revealed: oc.player1Revealed,
    player2Revealed: oc.player2Revealed,

    // read directly from backendReveal fields
    player1Reveal: backend?.player1Reveal || null,
    player2Reveal: backend?.player2Reveal || null,

    // terminal state — CHAIN ONLY
    settled: oc.settled,
    cancelled: oc.cancelled === true,
    winner: oc.settled ? oc.winner : null,

    // metadata
    settledAt: backend?.settledAt || null,
    roundResults: backend?.roundResults || [],
    tie: backend?.tie === true,
  };
});

    console.log(`GET /games — returning ${merged.length} merged games`);
    res.json(merged);

  } catch (err) {
    console.error("GET /games error:", err);
    res.status(500).json({ error: "Failed to load games" });
  }
});

// ---------------- GET SINGLE GAME ----------------
router.get("/:id", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    const games = readGames();
    let game = games.find(g => g.id === gameId);

    if (!game) {
      // fallback: try fetching from on-chain contract
      try {
        const readProvider = new ethers.JsonRpcProvider(RPC_URL);
        const contractRead = new ethers.Contract(GAME_ADDRESS, GameABI, readProvider);
        const onChainGame = await contractRead.games(gameId);

        if (onChainGame.player1 === ethers.ZeroAddress) {
          return res.status(404).json({ error: "Game not found" });
        }

        game = {
          id: gameId,
          player1: onChainGame.player1,
          player2: onChainGame.player2,
          stakeAmount: onChainGame.stakeAmount.toString(),
          stakeToken: onChainGame.stakeToken,
          settled: onChainGame.settled,
          winner: onChainGame.winner,
          player1Revealed: onChainGame.player1Revealed,
          player2Revealed: onChainGame.player2Revealed,
        };
      } catch (err) {
        console.error(`Failed to fetch on-chain game ${gameId}:`, err);
        return res.status(404).json({ error: "Game not found" });
      }
    }

    res.json(game);
  } catch (err) {
    console.error(`GET /games/${req.params.id} error:`, err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- CREATE GAME ROUTE--------*/
router.post("/", async (req, res) => {
  console.log("🔥 CREATE GAME HIT", req.body);

  const { gameId, creator, stakeToken, stakeAmount } = req.body;

  if (!creator || !stakeToken || !stakeAmount)
    return res.status(400).json({ error: "Invalid payload" });

  if (typeof gameId !== "number")
    return res.status(400).json({ error: "gameId required" });

  const games = readGames();

  if (games.some(g => g.id === gameId))
    return res.status(409).json({ error: "Game already exists" });

  const player1Lc = creator.toLowerCase();

games.push({
  id: gameId,
  player1: player1Lc,
  player2: null,
  stakeToken,
  stakeAmount,
  createdAt: new Date().toISOString(),
  cancelled: false,
  winner: null,
  tie: false,
  player1Reveal: null,
  player2Reveal: null
});

  writeGames(games);
  console.log("✅ Game created:", gameId);

  broadcast("GameCreated", games);

  // Populate ownership cache for creator (Player 1)
  const cache = readOwnerCache();

  if (!cache[player1Lc]) {
    console.log(`Populating initial ownership cache for creator ${player1Lc}`);

    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const vkin = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);
      const vqle = new ethers.Contract(VQLE_CONTRACT_ADDRESS, VQLE_ABI, provider);

      console.log("Fetching VKIN tokens...");
      const vkinIds = await fetchOwnedTokenIds(vkin, player1Lc, "VKIN");

      console.log("Fetching VQLE tokens...");
      const vqleIds = await fetchOwnedTokenIds(vqle, player1Lc, "VQLE");

      cache[player1Lc] = {
        VKIN: vkinIds,
        VQLE: vqleIds,
      };

      writeOwnerCache(cache);
      console.log(`Cache populated for ${player1Lc}: ${vkinIds.length} VKIN, ${vqleIds.length} VQLE`);
    } catch (err) {
      console.error("Failed to populate creator cache:", err.message, err.stack);
    }
  }

  res.json({ success: true, gameId });
});

  // ---------------- JOIN GAME ----------------
router.post("/:id/join", (req, res) => {
  console.log("🔥 JOIN GAME HIT", req.params, req.body);

  const gameId = Number(req.params.id);
  const { player2 } = req.body;

  if (!Number.isInteger(gameId) || !player2) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const games = readGames();
  const game = games.find(g => g.id === gameId);

  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }

  if (game.player2) {
    return res.status(409).json({ error: "Game already joined" });
  }

  if (game.player1 === player2.toLowerCase()) {
    return res.status(403).json({ error: "Creator cannot join own game" });
  }

  game.player2 = player2.toLowerCase();
  game.player2JoinedAt = new Date().toISOString();

  writeGames(games);

    broadcast("GameJoined", games);

  console.log("✅ Game joined:", gameId);
  res.json({ success: true });
});

router.post("/:id/reveal", async (req, res) => {  // ← make async so we can await contract calls
  try {
    const gameId = Number(req.params.id);
    const { player, salt, nftContracts, tokenIds } = req.body;

    if (!player || !salt || !Array.isArray(nftContracts) || !Array.isArray(tokenIds)) {
      return res.status(400).json({ error: "Missing reveal data" });
    }

    if (nftContracts.length !== tokenIds.length) {
      return res.status(400).json({ error: "nftContracts and tokenIds length mismatch" });
    }

    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const playerLc = player.toLowerCase();
// Determine slot
let slot;
if (game.player1 === playerLc) slot = "player1";
else if (game.player2 === playerLc) slot = "player2";
else return res.status(403).json({ error: "Not a game participant" });

// Check if reveal already submitted
if (game[slot + "Reveal"]) {
  return res.status(400).json({ error: "Reveal already submitted" });
}

// Save reveal data directly
const revealData = {
  salt,
  nftContracts: [...nftContracts],
  tokenIds: [...tokenIds],
  tokenURIs,
  backgrounds,
};

game[slot + "Reveal"] = revealData;

// Update backend flags
game.backendPlayer1Revealed = !!game.player1Reveal;
game.backendPlayer2Revealed = !!game.player2Reveal;

    // ---- Map addresses to collection folders ----
    const addressToCollection = {
      [VKIN_CONTRACT_ADDRESS.toLowerCase()]: "VKIN",
      [VQLE_CONTRACT_ADDRESS.toLowerCase()]: "VQLE",
    };

    const mapping = loadMapping();

    const tokenURIs = [];
    const backgrounds = [];

    for (let i = 0; i < tokenIds.length; i++) {
      const contractAddr = nftContracts[i].toLowerCase();
      const collection = addressToCollection[contractAddr];

      if (!collection) {
        return res.status(400).json({ error: `Unknown contract: ${contractAddr}` });
      }

      const tokenId = String(tokenIds[i]);
      const mapped = mapping[collection]?.[tokenId];

      if (!mapped) {
        return res.status(400).json({ error: `Missing mapping for ${collection} token ${tokenId}` });
      }

      const jsonFile = mapped.token_uri || `${tokenId}.json`;
      const jsonPath = path.join(METADATA_JSON_DIR, collection, jsonFile);

      if (!fs.existsSync(jsonPath)) {
        return res.status(500).json({ error: `Metadata missing: ${jsonPath}` });
      }

      const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      const bgTrait = jsonData.attributes?.find(a => a.trait_type === "Background");
      const background = bgTrait?.value || "Unknown";

      tokenURIs.push(jsonFile);
      backgrounds.push(background);
    }

    writeGames(games);  // early save so state is persisted even if auto fails

    broadcast("GameRevealed", games);


    // ────────────────────────────────────────────────────────────────
    // Auto-resolve + post + settle WHEN BOTH PLAYERS HAVE REVEALED
    // ────────────────────────────────────────────────────────────────
    if (game.player1Revealed && game.player2Revealed) {
      console.log(`Both backend reveals saved for game ${gameId}. Waiting for on-chain confirmation...`);

      // Helper function to attempt resolution
      const tryResolveAndSettle = async (attempt = 1) => {
        try {
          const onChainGame = await contract.games(gameId);
          const p1OnChain = onChainGame.player1Revealed;
          const p2OnChain = onChainGame.player2Revealed;

          console.log(`Attempt ${attempt} - On-chain reveals: P1=${p1OnChain}, P2=${p2OnChain}`);

          if (!p1OnChain || !p2OnChain) {
            if (attempt >= 4) {  // ~12 seconds total wait
              console.log(`Gave up waiting for on-chain reveals after ${attempt} attempts`);
              return false;
            }
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 3000)); // 3 seconds
            return tryResolveAndSettle(attempt + 1);
          }

          // Both confirmed on-chain → proceed
          console.log(`Both on-chain reveals confirmed after ${attempt} attempts`);

          // Compute results if not already done
          if (!game.roundResults?.length || !game.winner) {
            const resolved = resolveGame(game);
            if (!resolved) {
              console.warn(`resolveGame failed`);
              return false;
            }
            game.roundResults = resolved.rounds || [];
            game.winner = resolved.winner || null;
            game.tie = !!resolved.tie;
            console.log(`Resolved game ${gameId}: winner=${game.winner || 'tie'}, rounds=${game.roundResults.length}`);
          }

          // Post winner if needed
          if (!game.backendWinner) {
            const currentOnChain = await contract.games(gameId); // refresh
            if (currentOnChain.winner !== ethers.ZeroAddress) {
              game.backendWinner = currentOnChain.winner;
              console.log(`Winner already on-chain: ${game.backendWinner}`);
            } else {
              let winnerAddr = ethers.ZeroAddress;
              if (!game.tie && game.winner) {
                winnerAddr = game.winner.toLowerCase() === game.player1.toLowerCase()
                  ? game.player1
                  : game.player2;
              }
              console.log(`Sending postWinner(${gameId}, ${winnerAddr})`);
              const tx = await contract.postWinner(gameId, winnerAddr, { gasLimit: 450000 });
              await tx.wait();
              game.backendWinner = winnerAddr;
              game.winnerResolvedAt = new Date().toISOString();
              console.log(`postWinner success: ${tx.hash}`);
            }
          }

          // Settle if needed
if (game.settled && !game.cancelled) {
              const latestOnChain = await contract.games(gameId);
            if (latestOnChain.settled) {
              game.settled = true;
              game.settledAt = new Date().toISOString();
              console.log(`Game already settled on-chain`);
            } else {
              console.log(`Sending settleGame(${gameId})`);
              const tx = await contract.settleGame(gameId, { gasLimit: 350000 });
              await tx.wait();
              game.settled = true;
              game.settleTxHash = tx.hash;
              game.settledAt = new Date().toISOString();
              console.log(`settleGame success: ${tx.hash}`);
            }
          }

          writeGames(games);
          return true;

        } catch (err) {
          console.error(`Resolution attempt ${attempt} failed:`, err.message);
          if (attempt >= 4) return false;
          await new Promise(resolve => setTimeout(resolve, 4000));
          return tryResolveAndSettle(attempt + 1);
        }
      };

      // Start the retry process (non-blocking)
      tryResolveAndSettle().catch(err => {
        console.error(`Background resolution failed for game ${gameId}:`, err);
        // Optional: you could mark game.autoFailed = true; writeGames(games);
      });
    }

    // ── Respond immediately ──
    return res.json({
      savedReveal: {
        salt,
        nftContracts,
        tokenIds,
        tokenURIs,
        backgrounds,
      },
      message: game.player1Revealed && game.player2Revealed
        ? "Both reveals received — waiting for on-chain confirmation and automatic settlement..."
        : "Reveal saved. Waiting for the other player to reveal.",
    });

  } catch (err) {
    console.error("Reveal error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// Temporary backfill helper - POST /games/:id/backfill
router.post("/:id/backfill", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    const { field, value } = req.body;

    if (!["settleTxHash", "backendWinner", "settledAt"].includes(field)) {
      return res.status(400).json({ error: "Invalid field" });
    }

    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    game[field] = value;

    writeGames(games);

    console.log(`Backfilled ${field} for game ${gameId}: ${value}`);
    res.json({ success: true, updated: { [field]: value } });
  } catch (err) {
    console.error("Backfill error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- COMPUTE RESULTS ----------------
router.post("/:id/compute-results", async (req, res) => {
  await withLock(async () => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Require both reveals
    if (!game.player1Reveal || !game.player2Reveal) {
      return res.status(400).json({ error: "Both players must reveal first" });
    }

    // Idempotency — already computed
    if (Array.isArray(game.roundResults) && game.roundResults.length > 0) {
      return res.json({
        success: true,
        alreadyComputed: true,
        roundResults: game.roundResults,
        winner: game.winner,
        tie: game.tie,
      });
    }

    // Compute
    const resolved = await resolveGame(game);
    if (!resolved || !resolved.roundResults) {
      return res.status(500).json({ error: "Failed to compute game results" });
    }

    // Persist computation ONLY
game.roundResults = resolved.roundResults;
game.tie = resolved.tie;
game.winner = resolved.tie ? null : resolved.winner;
game.settlementState = "computed";

    writeGames(games);

    console.log(`compute-results completed for game ${gameId}`, {
      winner: resolved.winner,
      tie: resolved.tie,
      rounds: resolved.roundResults.length,
    });

    res.json({
      success: true,
      gameId,
      roundResults: resolved.roundResults,
      winner: resolved.winner,
      tie: resolved.tie,
    });

  } catch (err) {
    console.error("compute-results error:", err);
    res.status(500).json({ error: err.message || "Internal error" });
  }
});
});

/* ---------------- POST WINNER ---------------- */
router.post("/:id/post-winner", async (req, res) => {
  await withLock(async () => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    if (!adminWalletReady || !adminContract) {
      return res.status(503).json({
        error: "Backend admin wallet not ready",
      });
    }

    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Idempotent
    if (game.backendWinner) {
      return res.json({
        success: true,
        alreadyPosted: true,
        winner: game.backendWinner,
      });
    }

    // Require computed results
    if (!Array.isArray(game.roundResults) || game.roundResults.length === 0) {
      return res.status(400).json({
        error: "Results not computed yet",
      });
    }

    const winnerAddress = game.tie
      ? ethers.ZeroAddress
      : game.winner?.toLowerCase() === game.player1?.toLowerCase()
        ? game.player1
        : game.player2;

    // Chain idempotency
    const onChainWinner = await adminContract.backendWinner(gameId);
    if (onChainWinner === ethers.ZeroAddress) {
      const tx = await adminContract.postWinner(gameId, winnerAddress);
      await tx.wait();
      game.postWinnerTxHash = tx.hash;
    }

    game.backendWinner = winnerAddress;
    game.winnerResolvedAt = new Date().toISOString();
    game.settlementState = "winner-posted";

    writeGames(games);

    res.json({
      success: true,
      winner: winnerAddress,
    });

  } catch (err) {
    console.error("post-winner error:", err);
    res.status(500).json({ error: err.message });
  }
});
});

/* ---------------- MANUAL SETTLE GAME (ORCHESTRATOR) ---------------- */
router.post("/:id/settle-game", async (req, res) => {
  await withLock(async () => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    // ---- Load game FIRST (fixes TDZ bug) ----
    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // ---- Idempotency ----
    if (game.settled === true) {
      return res.json({
        success: true,
        alreadySettled: true,
        gameId,
      });
    }

    // ---- Require reveals ----
    if (!game.player1Reveal || !game.player2Reveal) {
      return res.status(400).json({
        error: "Both players must reveal before settling",
      });
    }

    // ------------------------------------------------------------
    // 1️⃣ ENSURE RESULTS COMPUTED (pure backend state)
    // ------------------------------------------------------------
    let resolved;
    if (!Array.isArray(game.roundResults) || game.roundResults.length === 0) {
      resolved = await resolveGame(game);
      if (!resolved || !resolved.roundResults) {
        return res.status(500).json({ error: "Failed to compute results" });
      }

      game.roundResults = resolved.roundResults;
      game.tie = resolved.tie;
      game.winner = resolved.tie ? null : resolved.winner;
      game.settlementState = "computed";

      writeGames(games);
    } else {
      resolved = {
        winner: game.winner,
        tie: game.tie,
        roundResults: game.roundResults,
      };
    }

    // ------------------------------------------------------------
    // 2️⃣ ENSURE WINNER POSTED ON-CHAIN (ADMIN ONLY)
    // ------------------------------------------------------------
    if (!game.backendWinner) {
      if (!adminWalletReady || !adminContract) {
        return res.status(503).json({
          error: "Backend admin wallet not ready",
        });
      }

      const winnerAddress = resolved.tie
        ? ethers.ZeroAddress
        : resolved.winner.toLowerCase() === game.player1.toLowerCase()
          ? game.player1
          : game.player2;

      // Chain idempotency check
      const onChainWinner = await adminContract.backendWinner(gameId);
      if (onChainWinner === ethers.ZeroAddress) {
        const tx = await adminContract.postWinner(gameId, winnerAddress);
        await tx.wait();

        game.postWinnerTxHash = tx.hash;
      }

      game.backendWinner = winnerAddress;
      game.winnerResolvedAt = new Date().toISOString();
      game.settlementState = "winner-posted";

      writeGames(games);
    }

    // ------------------------------------------------------------
    // 3️⃣ SETTLE GAME ON-CHAIN
    // ------------------------------------------------------------
    const txSettle = await contract.settleGame(gameId);
    await txSettle.wait();

    // ------------------------------------------------------------
    // 4️⃣ FINAL BACKEND COMMIT (SINGLE TERMINAL WRITE)
    // ------------------------------------------------------------
    game.settled = true;
    game.settleTxHash = txSettle.hash;
    game.settledAt = new Date().toISOString();
    game.settlementState = "settled";

    writeGames(games);

    // 🔔 Minimal broadcast payload (NO BigInts)
    broadcast("GameSettled", {
      gameId,
      txHash: txSettle.hash,
    });

    console.log(`✅ Game ${gameId} fully settled`);

    return res.json({
      success: true,
      gameId,
      txHash: txSettle.hash,
    });

  } catch (err) {
    console.error("manual settle-game error:", err);
    return res.status(500).json({
      error: err.message || "Failed to settle game",
    });
  }
});
});

/* ---------------- FINALIZE SETTLE ---------------- */
router.post("/:id/finalize-settle", async (req, res) => {
  const gameId = Number(req.params.id);
  const { txHash } = req.body;

  if (!txHash) {
    return res.status(400).json({ error: "Missing txHash" });
  }

  try {
    await withLock(async () => {
      const games = readGames();
      const game = games.find(g => g.id === gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });

      if (game.settled) {
        return res.json({ success: true, alreadySettled: true });
      }

      if (!game.backendWinner && !game.tie) {
        return res.status(400).json({ error: "Winner not posted yet" });
      }

      // ✅ Canonical settlement
      game.settled = true;
      game.settleTxHash = txHash;
      game.settledAt = new Date().toISOString();
      game.winner ??= game.backendWinner ?? ethers.ZeroAddress;

      writeGames(games);

      res.json({
        success: true,
        gameId,
        txHash,
      });
    });
  } catch (err) {
    console.error("finalize-settle error:", err);
    res.status(500).json({ error: err.message });
  }
});

    // ------------------ Setup provider and wallet ------------------
    if (!BACKEND_PRIVATE_KEY.startsWith("0x")) {
      throw new Error("Backend private key must start with 0x");
    }

/* ---------- CANCEL UNJOINED GAME ----------- */
router.post("/:id/cancel-unjoined", async (req, res) => {
  try {
    const gameId = Number(req.params.id);
    if (!Number.isInteger(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    // Ensure backend matches on-chain first
    await reconcileAllGamesScheduled();

    const games = readGames();
    const game = games.find(g => g.id === gameId);
    if (!game) return res.status(404).json({ error: "Game not found" });

    // Must be unjoined
    if (game.player2 && game.player2 !== ethers.ZeroAddress) {
      return res.status(400).json({ error: "Game already joined - cannot cancel" });
    }

    // Already in terminal state?
    if (game.cancelled || game.settled) {
      return res.status(400).json({ error: "Game already settled or cancelled" });
    }

    console.log(`[CANCEL] Cancelling unjoined game ${gameId}...`);

    // On-chain cancel
    const tx = await contract.cancelUnjoinedGame(gameId);
    console.log(`[CANCEL] tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`[CANCEL] confirmed on-chain`);

    // Update backend state to match chain
    game.cancelled = true;
    game.settled = true;
    game.settledAt = new Date().toISOString();
    game.settleTxHash = tx.hash;

    writeGames(games);

    broadcast("GameCancelled", games);

    return res.json({
      success: true,
      gameId,
      txHash: tx.hash,
      status: "cancelled",
    });

  } catch (err) {
    console.error("[CANCEL] error:", err);
    return res.status(500).json({
      error: err.reason || err.message || "Internal server error"
    });
  }
});

export default router;