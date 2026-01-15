import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import GameABI from "./abis/GameABI.json";
import ERC20ABI from "./abis/ERC20ABI.json";

import { GAME_ADDRESS, WHITELISTED_TOKENS, WHITELISTED_NFTS, RARE_BACKGROUNDS,
         ADMIN_ADDRESS } from "./config.js";
import mapping from "./mapping.json";

import { CoreClashLogo, AppBackground, PlanetZephyrosAE } from "./appMedia/media.js";
import GameCard from "./gameCard.jsx";

const BACKEND_URL = "http://localhost:3001";

export default function App() {

/**
 * @typedef {Object} OwnedNFT
 * @property {string} tokenId
 * @property {string} nftAddress
 * @property {string} name
 * @property {string} background
 * @property {string} tokenURI
 */

const renderTeamImages = (playerReveal) => {
  if (!playerReveal?.tokenURIs) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      {playerReveal.tokenURIs.map((uri, i) => {
        const id = uri.replace(".json", "");
        return (
          <img
            key={i}
            src={`${BACKEND_URL}/images/${id}.png`}
            alt={`NFT ${id}`}
            style={{
              width: 80,
              height: 80,
              objectFit: "cover",
              border: "1px solid #333",
              borderRadius: 6,
            }}
          />
        );
      })}
    </div>
  );
};

 /* ---------------- WALLET ---------------- */
const [provider, setProvider] = useState(null);
const [signer, setSigner] = useState(null);
const [account, setAccount] = useState(null);
const [walletError, setWalletError] = useState(null);
/** @type {[OwnedNFT[], Function]} */
const [ownedNFTs, setOwnedNFTs] = useState([]);

const connectWallet = useCallback(async () => {
  if (!window.ethereum) {
    alert("MetaMask not installed");
    return;
  }

  try {
    const prov = new ethers.BrowserProvider(window.ethereum);

    // 👇 Only request accounts when user clicks
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

    if (!accounts || accounts.length === 0) {
      // User rejected or no accounts
      setWalletError("Wallet connection rejected.");
      return;
    }

    const signer = await prov.getSigner();
    const addr = await signer.getAddress();

    setProvider(prov);
    setSigner(signer);
    setAccount(addr);
    setWalletError(null);
} catch (err) {
    // 🔥 USER REJECTED CONNECTION (MetaMask code 4001 / ethers ACTION_REJECTED)
    if (
      err?.code === 4001 ||
      err?.code === "ACTION_REJECTED"
    ) {
      setWalletError("Connect wallet to play");
      return;
    }

    console.error("Wallet connection failed:", err);
    setWalletError("Wallet connection failed");
  }
}, []);

/* ---------------- RESTORE WALLET ---------------- */
useEffect(() => {
  if (!window.ethereum) return;

  const restoreWallet = async () => {
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_accounts" });

      if (accounts.length === 0) {
        // No wallet connected — do nothing
        setAccount(null);
        return;
      }

      // Wallet previously connected, restore state silently
      const signer = await prov.getSigner();
      setProvider(prov);
      setSigner(signer);
      setAccount(accounts[0]);
      setWalletError(null);
    } catch {
      // Silent fail, do not block app
      setAccount(null);
    }
  };

  restoreWallet();

  // Listen for account changes
  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      setAccount(null);
      setOwnedNFTs([]);
    } else {
      setAccount(accounts[0]);
    }
  };

  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged", () => window.location.reload());

  return () => {
    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    window.ethereum.removeAllListeners("chainChanged");
  };
}, []);

/* ---------------- FETCH OWNED NFTS ---------------- */
useEffect(() => {
  if (!account) {
    setOwnedNFTs([]);
    return;
  }

  let cancelled = false; // prevent setting state if component unmounted

const fetchOwnedNFTs = async () => {
  try {
    // fetch owned NFTs from backend
    const res = await fetch(`http://localhost:3001/nfts/owned/${account}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

// normalize tokenId to string and ensure metadata
const normalized = data.map((nft) => ({
  ...nft,
  tokenId: nft.tokenId.toString(),
  name: nft.name || nft.metadata?.name || `Token #${nft.tokenId}`,
  background: nft.background || nft.metadata?.background || "Unknown",
  nftAddress: nft.address || nft.nftAddress, // optional
}));

    if (!cancelled) setOwnedNFTs(normalized);
  } catch (err) {
    console.error("Failed to load owned NFTs:", err);
    if (!cancelled) setOwnedNFTs([]);
  }
};

fetchOwnedNFTs();

return () => {
  cancelled = true;
};
}, [account]);

/* ---------------- GAME SETUP ---------------- */
  const [stakeToken, setStakeToken] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
const [nfts, setNfts] = useState([
  { address: "", tokenId: "", tokenURI: null, metadata: null },
  { address: "", tokenId: "", tokenURI: null, metadata: null },
  { address: "", tokenId: "", tokenURI: null, metadata: null },
]);

  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
  if (!stakeToken && WHITELISTED_TOKENS.length > 0) {
    setStakeToken(WHITELISTED_TOKENS[0].address);
  }
}, [stakeToken]);


  /* ---------------- PROVIDER + SIGNER ---------------- */
  useEffect(() => {
    if (!window.ethereum) return;

    const init = async () => {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const signer = await prov.getSigner();
      const addr = await signer.getAddress();
      setProvider(prov);
      setSigner(signer);
      setAccount(addr);
    };

    init();
  }, []);

  /* ---------------- GAME CONTRACT ---------------- */
  const gameContract = useMemo(() => {
    if (!provider || !signer) return null;
    return new ethers.Contract(GAME_ADDRESS, GameABI, signer);
  }, [provider, signer]);

  /* ---------------- GAMES STATE ---------------- */
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);

  /* ---------------- HELPERS ---------------- */
const updateNFT = (idx, field, value) => {
  setNfts((prev) => {
    const copy = [...prev];

    copy[idx][field] = value;

    // Reset metadata only if core identity changes
    if (field === "address" || field === "tokenId") {
      copy[idx].metadata = null;
      setValidated(false);
    }

    return copy;
  });
};

  const userOwnsNFT = useCallback(async (address, tokenId) => {
    if (!provider || !account) return false;
    const nft = new ethers.Contract(
      address,
      ["function ownerOf(uint256) view returns (address)"],
      provider
    );
const owner = await nft.ownerOf(BigInt(tokenId));
    return owner.toLowerCase() === account.toLowerCase();
  }, [provider, account]);

// eslint-disable-next-line no-unused-vars
  const debugGamesLength = async () => {
  if (!provider) return alert("Provider not ready");

  console.log("Checking on-chain games length...", debugGamesLength);

  try {
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
    let i = 0;

    while (true) {
      try {
        const g = await contract.games(i);
        if (g.player1 === ethers.ZeroAddress) break;
        i++;
      } catch {
        break;
      }
    }

    alert(`On-chain games count: ${i}`);
  } catch (err) {
    console.error(err);
    alert("Failed to read games length");
  }
};

const approveTokens = async () => {
  if (!signer || !stakeToken || !stakeAmount) {
    alert("Missing stake token or amount");
    return;
  }

  try {
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, signer);
    const stakeWei = ethers.parseUnits(stakeAmount, 18);

    const tx = await erc20.approve(GAME_ADDRESS, stakeWei);
    await tx.wait();

    alert("Tokens approved successfully");
  } catch (err) {
    console.error(err);
    alert(err.reason || err.message || "Approval failed");
  }
};

const downloadRevealBackup = useCallback(
  ({ gameId, player, salt, nftContracts, tokenIds, backgrounds }) => {
    const payload = {
      gameId: Number(gameId),
      player,
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
      backgrounds: backgrounds || [],
    };

    const playerKey =
      player.toLowerCase() === account.toLowerCase()
        ? "p1"
        : `p2_${gameId}`;

    localStorage.setItem(`${playerKey}_salt`, payload.salt);
    localStorage.setItem(
      `${playerKey}_nftContracts`,
      JSON.stringify(payload.nftContracts)
    );
    localStorage.setItem(
      `${playerKey}_tokenIds`,
      JSON.stringify(payload.tokenIds)
    );
    localStorage.setItem(
      `${playerKey}_backgrounds`,
      JSON.stringify(payload.backgrounds)
    );

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coreclash-reveal-game-${payload.gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  [account]
);

// ---------------- LOAD GAMES ----------------
const loadGames = useCallback(async () => {
  if (!provider) return;
  setLoadingGames(true);

  try {
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
    const loaded = [];
    let i = 0;

    while (true) {
      try {
        const g = await contract.games(i);
        if (!g || g.player1 === ethers.ZeroAddress) break;

        loaded.push({
          id: i,
          player1: g.player1,
          player2: g.player2,
          stakeAmount: g.stakeAmount,
          settled: g.settled,
          winner: g.winner,
          // ✅ backendWinner will come from backend
          player1TokenIds: g.player1TokenIds ? [...g.player1TokenIds] : [],
          player2TokenIds: g.player2TokenIds ? [...g.player2TokenIds] : [],
          player1Backgrounds: g.player1Backgrounds ? [...g.player1Backgrounds] : [],
          player2Backgrounds: g.player2Backgrounds ? [...g.player2Backgrounds] : [],
          roundResults: g.roundResults ? [...g.roundResults] : [],
        });

        i++;
      } catch (err) {
        console.error(`Failed to load game ${i}:`, err);
        break;
      }
    }

    // 🔽 Fetch authoritative backend data
    const res = await fetch(`${BACKEND_URL}/games`);
    const backendGames = await res.json();

const merged = loaded.map(g => {
  const backend = backendGames.find(bg => bg.id === g.id);

  return {
    ...g,
    _reveal: backend?._reveal || null,
    player1Revealed: backend?.player1Revealed === true || !!backend?._reveal?.player1,
    player2Revealed: backend?.player2Revealed === true || !!backend?._reveal?.player2,
    backendWinner: backend?.backendWinner || null,

    // ✅ Add this to populate team images after reveal
    player1Reveal: backend?._reveal?.player1 || null,
    player2Reveal: backend?._reveal?.player2 || null,
  };
});

    setGames(merged);
  } catch (err) {
    console.error("loadGames failed", err);
  } finally {
    setLoadingGames(false);
  }
}, [provider]);

// 🔥 Auto-load games when provider becomes available
useEffect(() => {
  if (provider) {
    loadGames();
  }
}, [provider, loadGames]);

useEffect(() => {
  window.__GAMES__ = games;
}, [games]);

  /* ---------------- SSE CONNECTION ---------------- */
  useEffect(() => {
    const es = new EventSource(`${BACKEND_URL}/events/stream`);

    const refresh = () => loadGames();
    es.addEventListener("GameCreated", refresh);
    es.addEventListener("GameJoined", refresh);
    es.addEventListener("GameCancelled", refresh);
    es.addEventListener("GameSettled", refresh);

    es.onerror = () => {
      console.warn("SSE disconnected");
      es.close();
    };

    return () => es.close();
  }, [loadGames]);

/* ---------------- VALIDATE TEAM ---------------- */
const validateTeam = useCallback(async () => {
  if (!nfts || nfts.length !== 3) {
    alert("You must select exactly 3 NFTs");
    return false;
  }

  setValidating(true);

try {
    const seenNames = new Set();
    const usedRareBackgrounds = new Set();

    for (let i = 0; i < nfts.length; i++) {
      const nft = nfts[i];
      const addr = nft?.address?.trim();
      const tokenId = nft?.tokenId?.toString()?.trim();
      const metadata = nft?.metadata;

      if (!addr || !tokenId) {
        alert(`Each NFT must have address and tokenId (problem at NFT #${i + 1})`);
        return false;
      }

      if (!metadata?.name || !metadata?.background) {
        alert(`Missing metadata for NFT #${i + 1}`);
        return false;
      }

      /* -------- Ownership check -------- */
      const owns = await userOwnsNFT(addr, tokenId);
      if (!owns) {
        alert(`You do NOT own NFT ${tokenId} at ${addr}`);
        return false;
      }

      /* -------- Duplicate character check -------- */
      if (seenNames.has(metadata.name)) {
        alert(`You cannot use the same character twice: ${metadata.name}`);
        return false;
      }
      seenNames.add(metadata.name);

/* -------- Rare background uniqueness check -------- */
      if (RARE_BACKGROUNDS.includes(metadata.background)) {
        if (usedRareBackgrounds.has(metadata.background)) {
          alert(
            `You may only use ONE of each rare background. Duplicate: ${metadata.background}`
          );
          return false;
        }
        usedRareBackgrounds.add(metadata.background);
      }
    }
    
    setValidated(true);
    alert("Team validated successfully!");
    return true;
  } catch (err) {
    console.error(err);
    alert(err.message || "Validation failed");
    return false;
  } finally {
    setValidating(false);
  }
}, [nfts, userOwnsNFT]);

/* ---------------- CREATE GAME ---------------- */
const createGame = useCallback(async () => {
  if (!validated || !signer || !gameContract) {
    alert("Wallet not connected or team not validated");
    return;
  }

  if (!stakeToken || !stakeAmount || nfts.some(n => !n.address || !n.tokenId)) {
    alert("All fields must be completed before creating a game");
    return;
  }

  try {
    /* ---------- Approve ERC20 ---------- */
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, signer);
    const stakeWei = ethers.parseUnits(stakeAmount, 18);

    const allowance = await erc20.allowance(account, GAME_ADDRESS);
    if (allowance < stakeWei) {
      const approveTx = await erc20.approve(GAME_ADDRESS, stakeWei);
      await approveTx.wait();
    }

    /* ---------- Prepare commit ---------- */
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    /* ---------- Create game on-chain ---------- */
    const tx = await gameContract.createGame(stakeToken, stakeWei, commit);
    const receipt = await tx.wait();

    /* ---------- Extract gameId from event ---------- */
    const parsedLogs = receipt.logs
      .map(log => {
        try {
          return gameContract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const createdEvent = parsedLogs.find(e => e.name === "GameCreated");
    if (!createdEvent) throw new Error("GameCreated event not found");

    const gameId = Number(createdEvent.args.gameId);
    if (!Number.isInteger(gameId)) throw new Error("Invalid gameId");

    /* ---------- Save game to backend ---------- */
    await fetch(`${BACKEND_URL}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId,
        creator: account,
        stakeToken,
        stakeAmount,
      }),
    });

    /* ---------- Download reveal backup ---------- */
    downloadRevealBackup({
      gameId,
      player: account.toLowerCase(),
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert(`Game #${gameId} created successfully!\nReveal file downloaded.`);
    await loadGames(); // refresh frontend

  } catch (err) {
    console.error("Create game failed:", err);
    alert(err.reason || err.message || "Create game failed");
  }
}, [
  validated,
  signer,
  gameContract,
  stakeToken,
  stakeAmount,
  nfts,
  account,
  loadGames,
  downloadRevealBackup,
]);

/* ---------------- JOIN GAME ---------------- */
const joinGame = async (gameId) => {
  if (!signer || !account || !gameContract) {
    alert("Wallet not connected");
    return;
  }

  try {
    const numericGameId = Number(gameId);

    /* ---------- Prepare commit ---------- */
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    // Solidity commit hash
    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    /* ---------- Join on-chain ---------- */
    const tx = await gameContract.joinGame(numericGameId, commit);
    await tx.wait();

    /* ---------- Notify backend ---------- */
    await fetch(`${BACKEND_URL}/games/${numericGameId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player2: account.toLowerCase() }),
    });

    /* ---------- Save reveal backup in localStorage for auto-reveal ---------- */
const prefix = `${account.toLowerCase()}_${numericGameId}`;

localStorage.setItem(`${prefix}_salt`, salt.toString());
localStorage.setItem(`${prefix}_nftContracts`, JSON.stringify(nftContracts));
localStorage.setItem(
  `${prefix}_tokenIds`,
  JSON.stringify(tokenIds.map(t => t.toString()))
);

    // Optional downloadable backup
    downloadRevealBackup({
      gameId: numericGameId,
      player: account.toLowerCase(),
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert(`Joined game #${numericGameId} successfully!`);

    /* ---------- Reload games and trigger auto-reveal ---------- */
    await loadGames(); // refresh window.__GAMES__

  } catch (err) {
    console.error("Join game failed:", err);
    alert(err.reason || err.message || "Join failed");
  }
};

/* ---------------- AUTO REVEAL ---------------- */
const autoRevealIfPossible = useCallback(
  async (g) => {
    if (!signer || !account || !gameContract) return;

    const isP1 = g.player1?.toLowerCase() === account.toLowerCase();
    const isP2 = g.player2?.toLowerCase() === account.toLowerCase();
    if (!isP1 && !isP2) return;

    // Already revealed? Nothing to do
    if ((isP1 && g.player1Revealed) || (isP2 && g.player2Revealed)) {
      console.log("Auto-reveal skipped: already revealed", g.id);
      return;
    }

    // Player 1 cannot reveal before Player 2 has joined
    if (isP1 && g.player2 === ethers.ZeroAddress) {
      console.log("Auto-reveal skipped: waiting for Player 2 to join", g.id);
      return;
    }

const prefix = `${account.toLowerCase()}_${g.id}`;

    const saltStr = localStorage.getItem(`${prefix}_salt`);
    const nftContractsStr = localStorage.getItem(`${prefix}_nftContracts`);
    const tokenIdsStr = localStorage.getItem(`${prefix}_tokenIds`);

    if (!saltStr || !nftContractsStr || !tokenIdsStr) {
      console.log("Auto-reveal skipped: missing localStorage", {
        saltStr, nftContractsStr, tokenIdsStr
      });
      return;
    }

    try {
      const salt = BigInt(saltStr);
      const nftContracts = JSON.parse(nftContractsStr);
      const tokenIds = JSON.parse(tokenIdsStr).map(BigInt);

      /* ---------------- BACKEND PRE-REVEAL ---------------- */
const preRes = await fetch(`${BACKEND_URL}/games/${g.id}/reveal`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    player: account.toLowerCase(),
    salt: salt.toString(),              // convert BigInt → string
    nftContracts,                        // array of addresses is fine
    tokenIds: tokenIds.map(t => t.toString()), // convert each BigInt → string
  }),
});
      const preData = await preRes.json();
      if (!preRes.ok) throw new Error(preData.error);

const tx = await gameContract.reveal(
  BigInt(g.id),
  BigInt(preData.savedReveal.salt),
  preData.savedReveal.nftContracts,
  preData.savedReveal.tokenIds.map(BigInt),
  preData.savedReveal.backgrounds // <-- this is mandatory now
);
      await tx.wait();

      console.log("Auto-reveal completed for game", g.id);

      // 🔥 Reload games immediately to update UI
      await loadGames();

    } catch (err) {
      console.error("Auto-reveal failed:", err);
    }
  },
  [signer, account, gameContract, loadGames]
);

// 🔧 DEBUG ONLY — expose contract + helpers to console
useEffect(() => {
  if (gameContract && signer && account) {
    window.__coreClash = {
      gameContract,
      signer,
      account,
    };
    console.log("🧪 Debug helpers exposed as window.__coreClash");
  }
}, [gameContract, signer, account]);


/* ---------------- REVEAL FILE UPLOAD ---------------- */
const handleRevealFile = useCallback(async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const { gameId, salt, nftContracts, tokenIds } = data;

    if (
      gameId === undefined ||
      !salt ||
      !Array.isArray(nftContracts) ||
      !Array.isArray(tokenIds)
    ) {
      throw new Error("Invalid reveal file");
    }

    if (!account || !signer) {
      throw new Error("Wallet not connected");
    }

    // ------------------- POST reveal to backend -------------------
    const res = await fetch(`${BACKEND_URL}/games/${gameId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: account.toLowerCase(),
        salt,
        nftContracts,
        tokenIds,
      }),
    });

    const backendData = await res.json();
    if (!res.ok) throw new Error(backendData.error || "Backend reveal failed");

    const { savedReveal } = backendData;

    // ------------------- Save locally via helper -------------------
    downloadRevealBackup(
      {
        gameId,
        player: account.toLowerCase(),
        salt: savedReveal.salt,
        nftContracts: savedReveal.nftContracts,
        tokenIds: savedReveal.tokenIds,
        backgrounds: savedReveal.backgrounds || [],
      },
      account
    );

    // ------------------- Call contract -------------------
    const game = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    const tx = await game.reveal(
      BigInt(gameId),
      BigInt(savedReveal.salt),
      savedReveal.nftContracts,
      savedReveal.tokenIds.map((id) => BigInt(id)),
      savedReveal.backgrounds // <-- mandatory now
    );

    await tx.wait();

    alert("Reveal successful!");
    await loadGames(); // refresh UI

  } catch (err) {
    console.error("Reveal failed:", err);
    alert(`Reveal failed: ${err.message}`);
  }
}, [account, signer, loadGames, downloadRevealBackup]);

/* ---------- AUTO SETTLE GAME ---------- */
const autoSettleIfPossible = useCallback(
  async (g) => {
    if (!signer || !account || !gameContract) return;

    const isParticipant =
      g.player1?.toLowerCase() === account.toLowerCase() ||
      g.player2?.toLowerCase() === account.toLowerCase();

    if (!isParticipant) return;
    if (!g.player1Revealed || !g.player2Revealed) return;
    if (g.settled) return;

    try {
      const tx = await gameContract.settleGame(BigInt(g.id));
      await tx.wait();
      

      // 🔥 BACKEND SYNC
      await fetch(`${BACKEND_URL}/games/${g.id}/post-winner`, {
        method: "POST",
      });

      await loadGames();
    } catch (err) {
      console.error("Auto-settle failed:", err);
    }
  },
  [signer, account, gameContract, loadGames]
);

/* --------- TRIGGER AUTO-REVEAL AND AUTO-SETTLE ON GAMES LOAD --------- */
useEffect(() => {
  if (!games.length || !account) return;

  games.forEach((g) => {
    autoRevealIfPossible(g);

    // ⛔ NEVER try to settle unless reveals are complete
    if (g.player1Revealed && g.player2Revealed) {
      autoSettleIfPossible(g);
    }
  });
}, [games, account, autoRevealIfPossible, autoSettleIfPossible]);

const manualSettleGame = useCallback(
  async (gameId) => {
    try {
      if (!signer || !account || !gameContract) {
        alert("Wallet not ready");
        return;
      }

      const g = games.find(x => x.id === gameId);
      if (!g) {
        alert("Game not found");
        return;
      }

      if (!g.player1Revealed || !g.player2Revealed) {
        alert("Both players must reveal first");
        return;
      }

      if (!g.backendWinner && !g.tie) {
        alert("Winner not posted yet");
        return;
      }

      if (g.settled) {
        alert("Game already settled");
        return;
      }

      /* ---------------- DRY-RUN (CATCH REVERTS EARLY) ---------------- */
      try {
        await gameContract.callStatic.settleGame(BigInt(gameId));
      } catch (simErr) {
        console.error("Settle simulation failed:", simErr);
        throw new Error(
          simErr.reason ||
          "Settle would revert on-chain (invalid game state)"
        );
      }

      /* ---------------- ON-CHAIN SETTLE (SOURCE OF TRUTH) ---------------- */
      const tx = await gameContract.settleGame(BigInt(gameId));
      const receipt = await tx.wait();

      console.log("Game settled on-chain:", {
        gameId,
        txHash: receipt.hash,
      });

      /* ---------------- BACKEND FINALIZATION ---------------- */
      const res = await fetch(
        `${BACKEND_URL}/games/${gameId}/finalize-settle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: receipt.hash,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        console.warn("Backend finalize failed:", data);
        alert(
          "On-chain settle succeeded, but backend sync failed. Refreshing…"
        );
      }

      alert("Game settled successfully!");
      await loadGames();

    } catch (err) {
      console.error("Manual settle failed:", err);
      alert(err.reason || err.message || "Manual settle failed");
    }
  },
  [games, signer, account, gameContract, loadGames]
);

/* ---------------- BACKGROUND PRIORITY ---------------- */
const backgroundPriority = {
  Gold: 0,
  "Verdant Green": 1,
  Silver: 2,
};

/* ---------------- FILTERED + SORTED GAMES ---------------- */
const openGames = [...games]
  .filter(g => g.player2 === ethers.ZeroAddress)
  .sort((a, b) => b.id - a.id);

const activeGames = [...games]
  .filter(g => g.player2 !== ethers.ZeroAddress && !g.settled)
  .sort((a, b) => b.id - a.id);

const settledGames = [...games]
  .filter(g => g.settled)
  .sort((a, b) => b.id - a.id);

/* ---------------- RENDER GAME CARD ---------------- */
<>
{openGames.map((g) => (
    <GameCard
      key={g.id}
      g={g}
      account={account}
      signer={signer}
      approveTokens={approveTokens}
      joinGame={joinGame}
      manualSettleGame={manualSettleGame}
      handleRevealFile={handleRevealFile}
      renderTeamImages={renderTeamImages}
    />
  ))}
</>
  /* ---------------- GAME CARD PROPS ---------------- */
const gameCardProps = {
  account,
  signer,
  approveTokens,
  joinGame,
  manualSettleGame,
  handleRevealFile,
  renderTeamImages,
};

/* ---------------- UI ---------------- */
const [loading, setLoading] = useState(true);
const [countdown, setCountdown] = useState(5);

// Countdown effect
useEffect(() => {
  if (!loading) return;

  const timer = setInterval(() => {
    setCountdown((prev) => {
      if (prev === 1) {
        clearInterval(timer);
        setLoading(false);
        return 0;
      }
      return prev - 1;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [loading]);

if (loading) {
  // Loading screen with watermark
  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#18bb1a",
        }}
      >
        <img
          src={CoreClashLogo}
          alt="Core Clash"
          style={{
            width: 800,
            height: "auto",
            marginBottom: 0,
          }}
        />
        <p style={{ fontSize: 28, margin: 2 }}>Loading...</p>
        <p style={{ fontSize: 24, fontWeight: "bold" }}>{countdown}</p>
      </div>
    </div>
  );
}

// Main app UI
return (
  <div style={{ position: "relative", minHeight: "100vh", padding: 20, maxWidth: 900 }}>
    {/* ---------------- WATERMARK ---------------- */}
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundImage: `url(${AppBackground})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover",
        opacity: 0.3,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />

    {/* ---------------- APP CONTENT ---------------- */}
    <div style={{ position: "relative", zIndex: 1 }}>
      {/* ---------------- WALLET SECTION ---------------- */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* LEFT: Logo */}
          <img
            src={CoreClashLogo}
            alt="Core Clash"
            style={{ height: 120, width: "auto", pointerEvents: "none" }}
          />

          {/* CENTER: Connect Wallet / Status */}
          {!account ? (
            <button
              onClick={() => {
                setWalletError(null);
                connectWallet();
              }}
              style={{
                backgroundColor: "#18bb1a",
                color: "#fff",
                border: "none",
                padding: "12px 24px",
                fontSize: 18,
                fontWeight: "bold",
                borderRadius: 12,
                cursor: "pointer",
                boxShadow: "0 0 10px rgba(24,187,26,0.6)",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.boxShadow = "0 0 20px rgba(24,187,26,0.9)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.boxShadow = "0 0 10px rgba(24,187,26,0.6)")
              }
            >
              Connect Wallet
            </button>
          ) : (
            <div style={{ fontSize: 16, fontWeight: "bold", padding: "12px 24px" }}>
              Connected:
              <div style={{ fontSize: 10, opacity: 0.85 }}>{account}</div>
            </div>
          )}

          {/* RIGHT: Video */}
          <video
            src={PlanetZephyrosAE}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: 50,
              height: 50,
              objectFit: "cover",
              borderRadius: 10,
              pointerEvents: "none",
            }}
          />
        </div>

        {walletError && (
          <div style={{ fontSize: 14, opacity: 0.7 }}>{walletError}</div>
        )}
      </div>

      {/* ---------------- CREATE GAME ---------------- */}
      <h2>Create Game</h2>
      <label>Stake Token: </label>
      <select
        value={stakeToken}
        onChange={(e) => setStakeToken(e.target.value)}
        style={{ width: "20%", marginBottom: 6 }}
      >
        {WHITELISTED_TOKENS.map((t) => (
          <option key={t.address} value={t.address}>
            {t.label}
          </option>
        ))}
      </select>

      <label> Stake Amount: </label>
      <input
        value={stakeAmount}
        onChange={(e) => setStakeAmount(e.target.value)}
        style={{ width: "30%", marginBottom: 12 }}
      />

      <h3>Your Clash Team (3)</h3>
      {nfts.map((n, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          {/* NFT Collection Dropdown */}
          <label style={{ marginLeft: 8 }}>NFT Collection: </label>
          <select
            value={n.address}
            onChange={(e) => updateNFT(i, "address", e.target.value)}
            style={{ width: "20%", marginRight: 8 }}
          >
            <option value="">Select NFT Collection</option>
            {WHITELISTED_NFTS.map((nft) => (
              <option key={nft.address} value={nft.address}>
                {nft.label}
              </option>
            ))}
          </select>

          {/* Token ID Dropdown */}
          <label style={{ marginLeft: 8 }}>Token ID</label>
          <select
            value={n.tokenId}
            onChange={(e) => {
              const tokenId = e.target.value;
              const selected = ownedNFTs.find(
                (nft) =>
                  nft.tokenId === tokenId &&
                  nft.nftAddress?.toLowerCase() === n.address?.toLowerCase()
              );
              setNfts((prev) =>
                prev.map((slot, idx) =>
                  idx === i
                    ? {
                        ...slot,
                        tokenId,
                        metadata: selected
                          ? { name: selected.name, background: selected.background }
                          : null,
                        tokenURI: selected?.tokenURI,
                        address: selected?.nftAddress || slot.address,
                      }
                    : slot
                )
              );
            }}
            style={{ width: "30%", marginLeft: 8 }}
          >
            <option value="">Select NFT</option>
            {ownedNFTs
              .filter(
                (nft) =>
                  nft.nftAddress?.toLowerCase() === n.address?.toLowerCase() &&
                  !nfts.some((s, idx) => idx !== i && s.tokenId === nft.tokenId)
              )
              .slice()
              .sort((a, b) => {
                const bgA = backgroundPriority[a.background] ?? 99;
                const bgB = backgroundPriority[b.background] ?? 99;
                if (bgA !== bgB) return bgA - bgB;
                const nameCompare = (a.name || "").localeCompare(b.name || "");
                if (nameCompare !== 0) return nameCompare;
                return Number(a.tokenId) - Number(b.tokenId);
              })
              .map((nft) => (
                <option key={nft.tokenId} value={nft.tokenId}>
                  #{nft.tokenId} — {nft.name} ({nft.background})
                </option>
              ))}
          </select>

          {/* NFT Metadata Preview */}
          {n.metadata && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "#0f0f0f",
                padding: 8,
                borderRadius: 8,
                border: "1px solid #333",
              }}
            >
              <img
                src={
                  mapping[n.tokenId]
                    ? `${BACKEND_URL}/images/${mapping[n.tokenId].replace(".json", "")}.png`
                    : "/placeholder.png"
                }
                alt={n.metadata.name || `Token #${n.tokenId}`}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: "cover",
                  borderRadius: 6,
                  border: "1px solid #444",
                }}
                onError={(e) => (e.currentTarget.src = "/placeholder.png")}
              />
              <div style={{ fontSize: 14 }}>
                <div style={{ fontWeight: "bold" }}>{n.metadata.name}</div>
                <div style={{ opacity: 0.85 }}>Background: {n.metadata.background}</div>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        onClick={loadGames}
        style={{
          marginBottom: 12,
          padding: "6px 12px",
          border: "1px solid #444",
          background: "#111",
          color: "#ddd",
          cursor: "pointer",
        }}
      >
        🔄 Refresh Games
      </button>

      {account?.toLowerCase() === ADMIN_ADDRESS && (
        <button
          onClick={async () => {
            await fetch(`${BACKEND_URL}/admin/resync-games`, { method: "POST" });
            await loadGames();
            alert("Resync complete");
          }}
        >
          🛠 Resync from Chain
        </button>
      )}

      {/* ---------------- STATUS ---------------- */}
      <div style={{ fontSize: 12, color: "#aaa", marginTop: 12 }}>
        signer: {signer ? "✅" : "❌"} | validated: {validated ? "✅" : "❌"} | stakeToken:{" "}
        {stakeToken || "❌"} | stakeAmount: {stakeAmount || "❌"}
      </div>

      {/* ---------------- ACTION BUTTONS ---------------- */}
      <div style={{ marginTop: 12 }}>
        <button disabled={validating} onClick={validateTeam}>
          {validating ? "Validating..." : "Validate Team"}
        </button>
        <button
          onClick={createGame}
          disabled={!validated || !stakeToken || !stakeAmount || !signer}
          style={{ marginLeft: 8 }}
        >
          Create Game
        </button>
      </div>

      {/* ---------------- GAMES GRID ---------------- */}
      <h2 style={{ marginTop: 40 }}>Games</h2>
      {loadingGames && <p>Loading games…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        <div>
          <h3>🟢 Open</h3>
          {openGames.map((g) => (
            <GameCard key={g.id} g={g} {...gameCardProps} />
          ))}
        </div>
        <div>
          <h3>🟡 In Progress</h3>
          {activeGames.map((g) => (
            <GameCard key={g.id} g={g} {...gameCardProps} />
          ))}
        </div>
        <div>
          <h3>🔵 Settled</h3>
          {settledGames.map((g) => (
            <GameCard key={g.id} g={g} {...gameCardProps} />
          ))}
        </div>
      </div>
    </div>
  </div>
);
}
