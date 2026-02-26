/* eslint-disable no-unused-vars */

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { ethers } from "ethers";

import GameABI from "./abis/GameABI.json";
import ERC20ABI from "./abis/ERC20ABI.json";

import {
  GAME_ADDRESS,
  WHITELISTED_TOKENS,
  CORE_TOKEN,
  WHITELISTED_NFTS,
  RARE_BACKGROUNDS,
  ADMIN_ADDRESS,
  ADDRESS_TO_COLLECTION_KEY,
  BACKEND_URL,
} from "./config.js";

import mapping from "./mapping.json";
import { renderTokenImages } from "./renderTokenImages.jsx";

import {
  CoreClashLogo,
  AppBackground,
  PlanetZephyrosAE,
  HowToPlay,
  GameInfo,
  ElectroSwap,
  VerdantKinBanner,
} from "./appMedia/media.js";

import GameCard from "./gameCard.jsx";

export default function App() {
  /* ---------------- WALLET ---------------- */
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const disconnectWallet = () => {
  setAccount(null);
  setSigner(null);
  setProvider(null);
};


  /* ---------------- NFT STATE ---------------- */
  const [ownedNFTs, setOwnedNFTs] = useState([]);

const [nfts, setNfts] = useState([
  { address: "", tokenId: "", tokenURI: null, metadata: null },
  { address: "", tokenId: "", tokenURI: null, metadata: null },
  { address: "", tokenId: "", tokenURI: null, metadata: null },
]);

  /* ---------- DEBUG NFTs------------*/
useEffect(() => {
  console.group("NFT SLOTS DEBUG (ALL)");
  nfts.forEach((n, i) => {
    console.log(`Slot ${i}`, {
      address: n.address,
      tokenId: n.tokenId,
      metadata: n.metadata,
    });
  });
  console.groupEnd();
}, [nfts]);

/* ---------------- GAME SETUP ---------------- */
  const [stakeToken, setStakeToken] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");

  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
  if (!stakeToken && WHITELISTED_TOKENS.length > 0) {
    setStakeToken(WHITELISTED_TOKENS[0].address);
  }
}, [stakeToken]);

  /* ---------------- GAMES STATE ---------------- */
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [showResolved, setShowResolved] = React.useState(true);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [pendingAutoRevealGameId, setPendingAutoRevealGameId] = useState(null);

  /* ---------------- LOADING SCREEN ---------------- */
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(5);

  /* ---------------- HANDLE GAMECREATED EVENT ---------------- */
  const [showDeviceWarning, setShowDeviceWarning] = useState(false);
  const [deviceConfirmed, setDeviceConfirmed] = useState(false);

  /* ---------------- COUNTDOWN ---------------- */
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

/* ---------------- GAME CONTRACT ---------------- */
const publicProvider = useMemo(() => {
  return new ethers.JsonRpcProvider(
    process.env.REACT_APP_RPC_URL
  );
}, []);

const gameContract = useMemo(() => {
  if (!signer) return null;
  return new ethers.Contract(GAME_ADDRESS, GameABI, signer);
}, [signer]);

  /* ---------------- CONNECT WALLET ---------------- */
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
        setAccount(null);
        return;
      }

    const signer = await prov.getSigner();
    const addr = await signer.getAddress();
      setProvider(prov);
      setSigner(signer);
      setAccount(addr);
      setWalletError(null);
    } catch {
      setAccount(null);
    }
  };

  restoreWallet();

  const handleAccountsChanged = () => {
    window.location.reload();
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged", handleChainChanged);

  return () => {
    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    window.ethereum.removeListener("chainChanged", handleChainChanged);
  };
}, []);

  /* ---------------- OWNED NFT FETCH ---------------- */
useEffect(() => {
  if (!account) return setOwnedNFTs([]);

  const fetchOwned = async () => {
    try {
      let res = await fetch(`${BACKEND_URL}/nfts/owned/${account}`);
      let data = await res.json();

      console.log("Initial owned NFTs:", data);

if (data.length === 0) {
  console.warn("No NFTs — forcing cache population");
  try {
    const forceRes = await fetch(`${BACKEND_URL}/nfts/force-cache/${account}`, { method: 'POST' });
    if (!forceRes.ok) {
      const forceErr = await forceRes.json();
      console.error("Force cache failed:", forceErr);
      alert("Force cache failed: " + (forceErr.error || "Unknown error"));
    } else {
      console.log("Force cache succeeded");
    }

    res = await fetch(`${BACKEND_URL}/nfts/owned/${account}`);
    data = await res.json();
    console.log("Retry owned NFTs:", data);
  } catch (forceErr) {
    console.error("Force cache error:", forceErr);
  }
}
      setOwnedNFTs(data.map(n => ({ ...n, tokenId: n.tokenId.toString() })));
    } catch (err) {
      console.error("Owned fetch error:", err);
      setOwnedNFTs([]);
    }
  };

  fetchOwned();
}, [account]);

  /* ---------------- NFT UPDATE ---------------- */
  const updateNFT = (idx, field, value) => {
    setNfts((prev) => {
      const copy = [...prev];
      copy[idx][field] = value;
      if (field === "address" || field === "tokenId") {
        copy[idx].metadata = null;
        setValidated(false);
      }
      return copy;
    });
  };

const validateTeam = useCallback(async () => {
  setValidating(true);
  try {
    const seenNames = new Set();
    const seenRareBackgrounds = new Set();

    for (const n of nfts) {
      if (!n.metadata) {
        throw new Error("Missing metadata for one or more NFTs");
      }

let { name, background } = n.metadata;

name = name?.trim().toLowerCase();
background = background?.trim();

      if (!name || !background) {
        throw new Error(`Incomplete metadata for token #${n.tokenId || "?"}`);
      }

      // Duplicate character check
if (seenNames.has(name)) {
  throw new Error(`Duplicate character: ${n.metadata.name}`);
}
seenNames.add(name);

// Rare background rule (robust, no Set dependency)
if (RARE_BACKGROUNDS.includes(background)) {
  if (seenRareBackgrounds.has(background)) {
    throw new Error(`Rare background duplicated: ${background}`);
  }
  seenRareBackgrounds.add(background);
}
      }

    setValidated(true);
    alert("Team validated successfully!");
  } catch (e) {
    alert(`Validation failed: ${e.message}`);
  } finally {
    setValidating(false);
  }
}, [nfts]);

  /* -------- APPROVE TOKENS ----------*/
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

/* ---------------- LOAD GAMES ---------------- */
const loadGames = useCallback(async () => {
  setLoadingGames(true);

  try {
    const readProvider = publicProvider;
    const contract = new ethers.Contract(
      GAME_ADDRESS,
      GameABI,
      readProvider
    );

    const loadedOnChain = [];
    let i = 0;

    while (true) {
      try {
        const gameData = await contract.games(i);
        if (gameData.player1 === ethers.ZeroAddress) break;

        loadedOnChain.push({
          id: i,
          player1: gameData.player1,
          player2: gameData.player2,
          stakeAmount: gameData.stakeAmount.toString(),
          stakeToken: gameData.stakeToken,
          settled: gameData.settled,
          winner: gameData.winner,
          player1Revealed: gameData.player1Revealed,
          player2Revealed: gameData.player2Revealed,
        });

        i++;
      } catch (err) {
        console.error(`Failed to load on-chain game ${i}:`, err);
        break;
      }
    }

    // 2. Fetch backend games (authoritative for reveals & results)
    const res = await fetch(`${BACKEND_URL}/games`);
    if (!res.ok) throw new Error(`Backend games fetch failed: ${res.status}`);
    const backendGames = await res.json();

    // 3. Merge: backend takes precedence for computed/reveal fields
const merged = backendGames.map((backendGame) => {
  const onChainGame =
    loadedOnChain.find(g => g.id === backendGame.id) || {};

  return {
    id: backendGame.id,

    // players
    player1: onChainGame.player1 || backendGame.player1 || ethers.ZeroAddress,
    player2: onChainGame.player2 || backendGame.player2 || ethers.ZeroAddress,

    // stake
    stakeAmount:
      onChainGame.stakeAmount || backendGame.stakeAmount || "0",
    stakeToken:
      backendGame.stakeToken || onChainGame.stakeToken,

    // reveals
    player1Revealed: !!backendGame.player1Revealed,
    player2Revealed: !!backendGame.player2Revealed,
    player1Reveal: backendGame.player1Reveal || null,
    player2Reveal: backendGame.player2Reveal || null,

    // results
    roundResults: backendGame.roundResults || [],
    winner:
      backendGame.winner ||
      onChainGame.winner ||
      ethers.ZeroAddress,
    tie: !!backendGame.tie,

// settlement
settled:
  backendGame.settled === true ||
  onChainGame.settled === true,
settledAt: backendGame.settledAt || null,
settleTxHash: backendGame.settleTxHash || null,

    // cancellation
    cancelled: backendGame.cancelled === true,
  };
});

    console.log("Merged games count:", merged.length);
    setGames(merged);
  } catch (err) {
    console.error("loadGames failed:", err);
  } finally {
    setLoadingGames(false);
  }
}, [publicProvider]);

// 🔥 Auto-load games when provider becomes available
useEffect(() => {
    loadGames();
}, [loadGames]);

useEffect(() => {
  if (process.env.NODE_ENV === "development") {
    window.__GAMES__ = games;
  }
}, [games]);

/* ---------------- REVEAL SUCCESS – Trigger backend compute ---------------- */
  const triggerBackendComputeIfNeeded = useCallback(async (gameId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/games/${gameId}/compute-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const err = await res.json();
        console.warn("Backend compute-results failed:", err);
      } else {
        console.log(`Backend compute-results triggered for game ${gameId}`);
        await loadGames();
      }
    } catch (err) {
      console.error("Trigger compute failed:", err);
    }
  }, [loadGames]);

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

/* ---------------- CREATE GAME ---------------- */
const createGame = useCallback(async () => {
if (!validated) {
  alert("Team not validated");
  return;
}

if (!signer) {
  alert("Wallet not connected");
  return;
}

const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

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
    const tx = await contract.createGame(stakeToken, stakeWei, commit);
    const receipt = await tx.wait();

    /* ---------- Extract gameId from event ---------- */
    const parsedLogs = receipt.logs
      .map(log => {
        try {
          return contract.interface.parseLog(log);
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
  stakeToken,
  stakeAmount,
  nfts,
  account,
  loadGames,
  downloadRevealBackup,
]);

/* -------- CANCEL UNJOINED GAME -----------*/
const cancelUnjoinedGame = async (gameId) => {
  if (!signer || !gameContract) {
    alert("Wallet not connected");
    return;
  }

  try {
    // 1️⃣ Cancel on-chain (creator signs)
    const tx = await gameContract.cancelUnjoinedGame(gameId);
    await tx.wait();

    await loadGames();
    alert(`Game #${gameId} cancelled successfully`);
  } catch (err) {
    console.error("Cancel failed:", err);
    alert(err.reason || err.message || "Cancel failed");
  }
};

/* ---------------- JOIN GAME ---------------- */
const joinGame = async (gameId) => {
if (!signer) {
  alert("Wallet not connected");
  return;
}

const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

  try {
    const numericGameId = Number(gameId);

 // 🔒 Derive wallet live from provider
  const liveSigner = await provider.getSigner();
  const liveAccount = await liveSigner.getAddress();

  if (!liveAccount || liveAccount === ethers.ZeroAddress) {
    throw new Error("Invalid wallet address");
  }
    
    // 1. Fetch game details from backend to get stakeToken & stakeAmount
    const gameRes = await fetch(`${BACKEND_URL}/games/${numericGameId}`);
    if (!gameRes.ok) throw new Error("Failed to fetch game details");
    const gameData = await gameRes.json();

    const stakeToken = gameData.stakeToken;
    const stakeAmount = gameData.stakeAmount; // already in string/decimal form

    if (!stakeToken || !stakeAmount) {
      throw new Error("Missing stake information from game");
    }

    console.log(`Joining game ${numericGameId} with stake: ${stakeAmount} of token ${stakeToken}`);

    // 2. Prepare commit (unchanged)
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    // 3. Approve tokens using fetched stakeAmount
const erc20 = new ethers.Contract(stakeToken, ERC20ABI, liveSigner);
    const stakeWei = ethers.parseUnits(stakeAmount, 18); // assuming 18 decimals

    const allowance = await erc20.allowance(liveAccount, GAME_ADDRESS);
    if (allowance < stakeWei) {
      console.log("Approving tokens...");
      const approveTx = await erc20.approve(GAME_ADDRESS, stakeWei);
      await approveTx.wait();
      alert("Tokens approved!");
    }

    // 4. Join on-chain
    console.log("Joining on-chain...");
    const tx = await contract.joinGame(numericGameId, commit);
    await tx.wait();

const gameOnChain = await contract.games(numericGameId);

if (gameOnChain.player2.toLowerCase() !== liveAccount.toLowerCase()) {
  throw new Error("On-chain player mismatch");
}

await fetch(`${BACKEND_URL}/games/${numericGameId}/join`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    player2: gameOnChain.player2
  }),
});

    // 6. Save reveal backup (unchanged)
    const prefix = `${liveAccount.toLowerCase()}_${numericGameId}`;
    localStorage.setItem(`${prefix}_salt`, salt.toString());
    localStorage.setItem(`${prefix}_nftContracts`, JSON.stringify(nftContracts));
    localStorage.setItem(
      `${prefix}_tokenIds`,
      JSON.stringify(tokenIds.map(t => t.toString()))
    );

    downloadRevealBackup({
      gameId: numericGameId,
      player: liveAccount.toLowerCase(),
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert(`Joined game #${numericGameId} successfully!`);

// At the end of joinGame
await loadGames();
setPendingAutoRevealGameId(numericGameId);

  } catch (err) {
    console.error("Join game failed:", err);
    alert(err.reason || err.message || "Join failed");
  }
};

/* ---------------- AUTO REVEAL (CHAIN AUTHORITATIVE) ---------------- */
const autoRevealIfPossible = useCallback(
  async (g) => {
    if (!signer || !account || !gameContract) return;

    try {
      // 1️⃣ Always fetch fresh on-chain state
      const chainGame = await gameContract.games(BigInt(g.id));

      const accountLower = account.toLowerCase();
      const zeroLower = ethers.ZeroAddress.toLowerCase();

      const player1 = chainGame.player1.toLowerCase();
      const player2 = chainGame.player2.toLowerCase();

      const isP1 = player1 === accountLower;
      const isP2 = player2 === accountLower;

      if (!isP1 && !isP2) {
        console.log("Auto-reveal skipped: not a participant", g.id);
        return;
      }

      // 2️⃣ Prevent reveal if already revealed (use chain state if available)
      const player1Revealed = chainGame.player1Revealed;
      const player2Revealed = chainGame.player2Revealed;

      if ((isP1 && player1Revealed) || (isP2 && player2Revealed)) {
        console.log("Auto-reveal skipped: already revealed", g.id);
        return;
      }

      // 3️⃣ Ensure both players exist on-chain
      if (player2 === zeroLower) {
        console.log("Auto-reveal skipped: waiting for Player 2 (chain)", g.id);
        return;
      }

      // 4️⃣ Load local commit data
      const prefix = `${accountLower}_${g.id}`;

      const saltStr = localStorage.getItem(`${prefix}_salt`);
      const nftContractsStr = localStorage.getItem(`${prefix}_nftContracts`);
      const tokenIdsStr = localStorage.getItem(`${prefix}_tokenIds`);

      if (!saltStr || !nftContractsStr || !tokenIdsStr) {
        console.log("Auto-reveal skipped: missing localStorage data", g.id);
        return;
      }

      const salt = BigInt(saltStr);
      const nftContracts = JSON.parse(nftContractsStr);
      const tokenIds = JSON.parse(tokenIdsStr).map(BigInt);

      /* ---------------- BACKEND PRE-REVEAL ---------------- */
      const preRes = await fetch(`${BACKEND_URL}/games/${g.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: accountLower,
          salt: salt.toString(),
          nftContracts,
          tokenIds: tokenIds.map(t => t.toString()),
        }),
      });

      const preData = await preRes.json();
      console.log("Backend reveal response:", preData);

      if (!preRes.ok) {
        throw new Error(preData.error || "Backend pre-reveal failed");
      }

      // 5️⃣ On-chain reveal
      const tx = await gameContract.reveal(
        BigInt(g.id),
        BigInt(preData.savedReveal.salt),
        preData.savedReveal.nftContracts,
        preData.savedReveal.tokenIds.map(BigInt),
        preData.savedReveal.backgrounds
      );

      await tx.wait();

      console.log("Auto-reveal completed for game", g.id);
      alert(`✅ Reveal successful for game #${g.id}`);

      // 6️⃣ Trigger backend compute
      await triggerBackendComputeIfNeeded(g.id);

      // 7️⃣ Reload UI
      await loadGames();

    } catch (err) {
      console.error("Auto-reveal failed:", err);
    }
  },
  [signer, account, gameContract, loadGames, triggerBackendComputeIfNeeded]
);

useEffect(() => {
  if (!pendingAutoRevealGameId) return;

  const game = games.find(g => g.id === pendingAutoRevealGameId);
  if (game) {
    autoRevealIfPossible(game);
    setPendingAutoRevealGameId(null);
  }
}, [games, pendingAutoRevealGameId, autoRevealIfPossible]);


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

    // POST to backend (no need for contract constants here)
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

    // Save locally
    downloadRevealBackup({
      gameId,
      player: account.toLowerCase(),
      salt: savedReveal.salt,
      nftContracts: savedReveal.nftContracts,
      tokenIds: savedReveal.tokenIds,
      backgrounds: savedReveal.backgrounds || [],
    });

    // Call on-chain reveal
    const game = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    const tx = await game.reveal(
      BigInt(gameId),
      BigInt(savedReveal.salt),
      savedReveal.nftContracts,
      savedReveal.tokenIds.map((id) => BigInt(id)),
      savedReveal.backgrounds
    );

// After successful upload + on-chain reveal
await tx.wait();

alert("Reveal successful!");
await triggerBackendComputeIfNeeded(gameId);  // ← add this
await loadGames();

  } catch (err) {
    console.error("Reveal failed:", err);
    alert(`Reveal failed: ${err.message}`);
  }
}, [account, signer, loadGames, downloadRevealBackup, triggerBackendComputeIfNeeded]);

/* ------ MANUAL SETTLE GAME -------- */
const manualSettleGame = useCallback(
  async (gameId) => {
    try {
      if (!signer || !account) {
        alert("Wallet not ready");
        return;
      }

      // Step 1: Compute results on backend
      const computeRes = await fetch(`${BACKEND_URL}/games/${gameId}/compute-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());

      if (!computeRes.success) {
        alert(`Failed to compute results: ${computeRes.error || "Unknown error"}`);
        return;
      }

      console.log("Computed results:", computeRes);

      // Step 2: Post winner on-chain
      const postWinnerRes = await fetch(`${BACKEND_URL}/games/${gameId}/post-winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());

if (!postWinnerRes.success || postWinnerRes.alreadyPosted) {
  if (!postWinnerRes.success) {
    alert(`Failed to post winner: ${postWinnerRes.error}`);
    return;
  }
}

      console.log("Winner posted:", postWinnerRes);

      // Step 3: Settle game on-chain only if not already settled
      const settleRes = await fetch(`${BACKEND_URL}/games/${gameId}/settle-game`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json());

      if (!settleRes.success) {
        if (settleRes.alreadySettled) {
          console.log(`Game ${gameId} already settled on-chain`);
        } else {
          alert(`Failed to settle game: ${settleRes.error || "Unknown error"}`);
          return;
        }
      } else {
        console.log(`Game ${gameId} settled successfully:`, settleRes.txHash);
      }

if (!postWinnerRes.txHash) {
  throw new Error("Awaiting on-chain postWinner and settleGame transaction. Reconcile also needs to run... please wait (~2mins). Hit refresh games");
}

      // Refresh local state
      await loadGames();

    } catch (err) {
      console.error("Manual settle failed:", err);
      alert(err.message || "Manual settle failed");
    }
  },
  [signer, account, loadGames]
);

/// ---------------- MODAL STYLES ----------------
const modalOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.6)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalBoxStyle = {
  background: "#111",
  padding: 24,
  borderRadius: 12,
  width: 400,
  maxWidth: "90%",
  color: "#fff",
};

  /* ---------------- GAME CARD PROPS ---------------- */
const gameCardProps = {
  account,
  signer,
  approveTokens,
  joinGame,
  manualSettleGame,
  handleRevealFile,
  cancelUnjoinedGame,
  renderTokenImages,
};

/* ---------------- BACKGROUND PRIORITY ---------------- */
const backgroundPriority = {
  Gold: 0,
  "Verdant Green": 1,
  Silver: 2,
};

/* ---------------- FILTERED + SORTED GAMES ---------------- */
const openGames = games
  .filter(
    (g) =>
      (!g.player2 || g.player2 === ethers.ZeroAddress) &&
      !g.settled &&
      !g.cancelled
  )
  .sort((a, b) => b.id - a.id);

const activeGames = games
  .filter(
    (g) =>
      g.player2 &&
      g.player2 !== ethers.ZeroAddress &&
      !g.settled &&
      !g.cancelled
  )
  .sort((a, b) => b.id - a.id);

const settledGames = games
  .filter((g) => g.settled && !g.cancelled)
  .sort((a, b) => b.id - a.id);

const cancelledGames = games
  .filter((g) => g.cancelled && showCancelled) // only show if showCancelled checked
  .sort((a, b) => b.id - a.id);

const sortedSettledGames = [...settledGames]
  .filter(g => g.settledAt) // ensure timestamp exists
  .sort((a, b) => Number(b.settledAt) - Number(a.settledAt));

const latestSettled = sortedSettledGames.slice(0, 10);
const archivedSettled = sortedSettledGames.slice(10);

/* ---------------- LEADERBOARD ---------------- */
const leaderboard = useMemo(() => {
  const stats = {};

  games
    .filter(g => g.settled && !g.cancelled)
    .forEach(g => {
      const p1 = g.player1?.toLowerCase();
      const p2 = g.player2?.toLowerCase();
      const winner = g.winner?.toLowerCase();
      const isTie = g.tie;

      [p1, p2].forEach(player => {
        if (!player || player === ethers.ZeroAddress.toLowerCase()) return;

        if (!stats[player]) stats[player] = { wins: 0, played: 0 };
        stats[player].played += 1;
      });

      if (!isTie && winner && winner !== ethers.ZeroAddress.toLowerCase()) {
        if (!stats[winner]) stats[winner] = { wins: 0, played: 0 };
        stats[winner].wins += 1;
      }
      // No need to do anything for ties: they just count in `played`, not in `wins`
    });

  return Object.entries(stats)
    .map(([address, data]) => ({
      address,
      wins: data.wins,
      played: data.played,
      winRate: data.played > 0 ? Math.round((data.wins / data.played) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.winRate - a.winRate;
    })
    .slice(0, 10);
}, [games]);

/* --------- TOTAL CORE BURN ---------*/
const [totalGameBurned, setTotalGameBurned] = useState(0);
const [burnPercent, setBurnPercent] = useState(0);

useEffect(() => {
  const fetchBurn = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/games/burn-total`);

      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status}`);
      }

      const data = await res.json();

      const burnWei = BigInt(data.totalBurnWei);
      // 🔥 Get live total supply from chain
      const supplyWei = await CORE_TOKEN.totalSupply();

      const burnFormatted = Number(ethers.formatEther(burnWei));
      const supplyFormatted = Number(ethers.formatEther(supplyWei));

      const percent =
        supplyFormatted > 0
          ? (burnFormatted / supplyFormatted) * 100
          : 0;

      setTotalGameBurned(burnFormatted);
      setBurnPercent(percent);

    } catch (err) {
      console.error("Burn fetch failed:", err);
    }
  };

  fetchBurn();
}, []);

/* ---------------- UI ---------------- */
if (loading) {
  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#18bb1a",
        }}
      >
        <img src={CoreClashLogo} alt="Core Clash" style={{ width: 800 }} />
        <p style={{ fontSize: 28 }}>Loading...</p>
        <p style={{ fontSize: 24, fontWeight: "bold" }}>{countdown}</p>
      </div>
    </div>
  );
}

/* ---------------- MAIN APP ---------------- */
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
        opacity: 0.25,
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
<div
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 24px",
    gap: 8,
  }}
>
  <div style={{ fontSize: 16, fontWeight: "bold" }}>
    Connected:
  </div>

  <div style={{ fontSize: 10, opacity: 0.85 }}>
    {account}
  </div>

  <button
    onClick={disconnectWallet}
    style={{
      backgroundColor: "#c62828",
      color: "#fff",
      border: "none",
      padding: "6px 14px",
      fontSize: 12,
      fontWeight: "bold",
      borderRadius: 8,
      cursor: "pointer",
      boxShadow: "0 0 8px rgba(198,40,40,0.6)",
      transition: "all 0.2s ease",
    }}
    onMouseEnter={(e) =>
      (e.currentTarget.style.boxShadow = "0 0 16px rgba(198,40,40,0.9)")
    }
    onMouseLeave={(e) =>
      (e.currentTarget.style.boxShadow = "0 0 8px rgba(198,40,40,0.6)")
    }
  >
    Disconnect
  </button>
</div>
          )}

{/* RIGHT: Video + External Links */}
<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
{/* CORE Token Link */}
<a
  href="https://app.electroswap.io/explore/tokens/electroneum/0x309b916b3a90cb3e071697ea9680e9217a30066f?inputCurrency=ETN"
  target="_blank"
  rel="noopener noreferrer"
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
  }}
>
  <img
    src={ElectroSwap}
    alt="Buy CORE on ElectroSwap"
    style={{
      width: 60,
      height: 60,
      borderRadius: 8, boxShadow: "0 0 8px rgba(0,0,0,0.6)", border: "1px solid #333",
      cursor: "pointer",
      transition: "transform 0.2s ease",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
  />
  <span
    style={{
      marginTop: 6,
      fontSize: 12,
      fontWeight: "bold",
      color: "#fff",
      opacity: 0.9,
    }}
  >
    Buy CORE
  </span>
</a>

{/* Verdant Kin NFT Link */}
<a
  href="https://app.electroswap.io/nfts/collection/0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4"
  target="_blank"
  rel="noopener noreferrer"
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
  }}
>
  <img
    src={VerdantKinBanner}
    alt="Verdant Kin NFT Collection"
    style={{
      height: 60,
      width: "auto",
      borderRadius: 8, boxShadow: "0 0 8px rgba(0,0,0,0.6)", border: "1px solid #333",
      cursor: "pointer",
      transition: "transform 0.2s ease",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
  />
  <span
    style={{
      marginTop: 6,
      fontSize: 12,
      fontWeight: "bold",
      color: "#fff",
      opacity: 0.9,
    }}
  >
    Build Your Team
  </span>
</a>

{/* Planet ETN Link */}
<a
  href="https://planetetn.org/zephyros"
  target="_blank"
  rel="noopener noreferrer"
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textDecoration: "none",
  }}
>
  <video
    src={PlanetZephyrosAE}
    autoPlay
    loop
    muted
    playsInline
    style={{
      width: 70,
      height: 60,
      objectFit: "cover",
      borderRadius: 8, boxShadow: "0 0 8px rgba(0,0,0,0.6)", border: "1px solid #333",
      pointerEvents: "none",
    }}    
  />
  <span
    style={{
      marginTop: 6,
      fontSize: 12,
      fontWeight: "bold",
      color: "#fff",
      opacity: 0.9,
    }}
  >
    Planet ETN
  </span>
  </a>
</div>
</div>

        {walletError && (
          <div style={{ fontSize: 14, opacity: 0.7 }}>{walletError}</div>
        )}
      </div>
      </div>

<div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
  {/* ---------------- CREATE GAME SECTION ---------------- */}
  <div style={{ flex: 1 /* take available width */ }}>
    <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
      Create Game
      </h2>
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

{nfts.map((n, i) => {
  // Resolve collection key from address (VKIN / VQLE)
  const collectionKey = WHITELISTED_NFTS.find(
    (x) => x.address?.toLowerCase() === n.address?.toLowerCase()
  )?.label === "Verdant Kin" ? "VKIN" : "VQLE";

  // Compute the image filename using new mapping.json structure
  let imageFile = null;
  if (n.tokenId && collectionKey) {
    const mapped = mapping[collectionKey]?.[String(n.tokenId)];

    if (mapped) {
      // Prefer real image_file if present
      imageFile = mapped.image_file ||
                  (mapped.token_uri?.replace(/\.json$/i, ".png") || `${n.tokenId}.png`);
      console.log(`Team preview slot ${i}: ${collectionKey} #${n.tokenId} → ${imageFile}`);
    } else {
      imageFile = `${n.tokenId}.png`;
      console.log(`Team preview slot ${i}: fallback ${collectionKey} #${n.tokenId} → ${imageFile}`);
    }
  }

  return (
    <div key={n.tokenId || n.address || i} style={{ marginBottom: 16 }}>
      {/* NFT Collection Dropdown */}
      <label style={{ marginLeft: 8 }}>NFT Collection: </label>
      <select
        value={n.address}
        onChange={(e) => {
          const newAddress = e.target.value;
          setNfts((prev) =>
            prev.map((slot, idx) =>
              idx === i
                ? {
                    ...slot,
                    address: newAddress,
                    tokenId: "",
                    metadata: null,
                    tokenURI: null,
                    imageSrc: null, // reset to prevent old image flicker
                  }
                : slot
            )
          );
        }}
        style={{ width: "220px", marginRight: 12 }}
      >
        <option value="">Select Collection</option>
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
                ? {
                    name: selected.name,
                    background: selected.background,
                  }
                : null,
              tokenURI: selected?.tokenURI,
              address: selected?.nftAddress || slot.address,
            }
          : slot
      )
    );
  }}
  style={{ width: "220px", marginLeft: 8 }}
  disabled={!n.address}
>
  <option value="">Select Token</option>
  {ownedNFTs
    .filter(
      (nft) =>
        nft.nftAddress?.toLowerCase() === n.address?.toLowerCase() &&
      !nfts.some(
        (s, idx) =>
          idx !== i &&
          s.tokenId === nft.tokenId &&
          s.address?.toLowerCase() === nft.nftAddress?.toLowerCase()
      )
    )
    .sort((a, b) => {
      const bgA = (a.background || "").trim();
      const bgB = (b.background || "").trim();

      const rankA = RARE_BACKGROUNDS.indexOf(bgA);
      const rankB = RARE_BACKGROUNDS.indexOf(bgB);

      if (rankA !== -1 || rankB !== -1) {
        if (rankA === -1) return 1;
        if (rankB === -1) return -1;
        return rankA - rankB;
      }

      if (bgA !== bgB) {
        return bgA.toLowerCase().localeCompare(bgB.toLowerCase());
      }

      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    })
    .map((nft) => (
      <option key={nft.tokenId} value={nft.tokenId}>
        {RARE_BACKGROUNDS.includes(nft.background) ? "🟢 " : ""}
        #{nft.tokenId} — {nft.name} ({nft.background})
      </option>
    ))}
</select>

      {/* Image Preview – appears once token is selected */}
      {n.tokenId && collectionKey && imageFile && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 8,
            background: "#0f0f0f",
            borderRadius: 8,
            border: "1px solid #333",
          }}
        >
          <img
            src={`${BACKEND_URL}/images/${collectionKey}/${imageFile}`}
            alt={`${collectionKey} #${n.tokenId}`}
            style={{
              width: 80,
              height: 80,
              objectFit: "cover",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
            }}
            onError={(e) => {
              e.currentTarget.src = "/placeholder.png";
              console.warn(`Preview failed: ${collectionKey}/${imageFile}`);
            }}
          />
          {n.metadata && (
            <div style={{ fontSize: 14 }}>
              <strong>{n.metadata.name}</strong>
              <div style={{ opacity: 0.85 }}>
                Background: {n.metadata.background}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional: show placeholder while loading/selecting */}
      {n.address && !n.tokenId && (
        <div
          style={{
            marginTop: 12,
            width: 80,
            height: 80,
            background: "#111",
            border: "1px dashed #444",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontSize: 12,
          }}
        >
          Select Token ID
        </div>
      )}
    </div>
  );
})}

    {account?.toLowerCase() === ADMIN_ADDRESS ? (
      <>
        <button type="button" onClick={loadGames}>🔄 Refresh Games</button>
        <button onClick={async () => {
          await fetch(`${BACKEND_URL}/admin/resync-games`, { method: "POST" });
          await loadGames();
          alert("Resync complete");
        }}>
          🛠 Resync from Chain
        </button>
      </>
    ) : (
      <div style={{ marginBottom: 12 }} />
    )}
  </div>

  {/* RIGHT: IMAGES */}
  <div
    style={{
      width: 60,
      height: 480,
      display: "flex",
      flexDirection: "row",
      gap: 12,
      position: "sticky",
      top: 24,
    }}
  >
    <img src={HowToPlay} alt="How to Play" style={{ borderRadius: 8, boxShadow: "0 0 8px rgba(0,0,0,0.6)",
border: "1px solid #333"}} />
    <img src={GameInfo} alt="Game Info" style={{ borderRadius: 8, boxShadow: "0 0 8px rgba(0,0,0,0.6)",
border: "1px solid #333" }} />
  </div>
</div>

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
          onClick={() => setShowDeviceWarning(true)}
          disabled={!validated || !stakeToken || !stakeAmount || !signer}
          style={{ marginLeft: 12 }}
        >
          Create Game
        </button>
      </div>

{showDeviceWarning && (
  <div style={modalOverlayStyle}>
    <div style={modalBoxStyle}>
      <h3>⚠ Important: Reveal File Backup</h3>

      <p>
        If you are using <b>MetaMask Mobile</b>, the reveal file will NOT
        automatically download.
      </p>

      <p>
        If the reveal file is not saved, you will be unable to reveal and
        will forfeit the game and your stake.
      </p>

      <p style={{ fontSize: 12, opacity: 0.8 }}>
        By continuing, you confirm that you understand this risk and have
        ensured your reveal file can be securely saved.
      </p>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => {
            setDeviceConfirmed(true);
            setShowDeviceWarning(false);
            createGame();
          }}
          style={{ marginRight: 10 }}
        >
          I Understand – Continue
        </button>

        <button onClick={() => setShowDeviceWarning(false)}>
          Cancel
        </button>
      </div>
    </div>
  </div>
)}


{/* ---------------- GAMES GRID ---------------- */}
<div style={{ marginTop: 40, marginBottom: 10 }}>
  <h2
    style={{
      fontWeight: "bold",
      fontSize: 26,
      letterSpacing: 1.5,
      textTransform: "uppercase",
      color: "#18bb1a",
      marginBottom: 6,
      textShadow: "0 0 8px #18bb1a, 0 0 16px #18bb1a",
    }}
  >
    Core Clashes
  </h2>

<button 
  type="button"
  onClick={loadGames}
  disabled={loadingGames}
  style={{
    background: "#222",
    color: "#18bb1a",
    border: "1px solid #18bb1a",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: loadingGames ? "not-allowed" : "pointer",
    fontSize: 13,
    opacity: loadingGames ? 0.6 : 1,
  }}
>
  🔄 Refresh Games
</button>
</div>

<div style={{ display: "grid", gridTemplateColumns: "250px 300px 1fr 500px", gap: 20 }}>
  {/* ---------------- GAMES COLUMNS ---------------- */}
  <div>
    <h3>🟢 Open ({openGames.length})</h3>
    {openGames.map((g) => (
      <GameCard key={g.id} g={g} {...gameCardProps} roundResults={g.roundResults || []} />
    ))}
  </div>

  <div>
    <h3>🟡 In Progress ({activeGames.length})</h3>
    {activeGames.map((g) => (
      <GameCard key={g.id} g={g} {...gameCardProps} roundResults={g.roundResults || []} />
    ))}
  </div>

  <div>
    {/* Settled / Cancelled / Archive Column */}
    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
      <label>
        <input type="checkbox" checked={showResolved} onChange={() => setShowResolved(v => !v)} /> Settled (Winner)
      </label>
      <label>
        <input type="checkbox" checked={showCancelled} onChange={() => setShowCancelled(v => !v)} /> Cancelled
      </label>
      <label>
        <input type="checkbox" checked={showArchive} onChange={() => setShowArchive(v => !v)} /> Archive
      </label>
    </div>

    {showResolved && latestSettled.length > 0 && (
      <div>
        <h3>🔵 Settled ({latestSettled.length})</h3>
        {[...latestSettled]
      .sort((a, b) => Number(b.settledAt) - Number(a.settledAt))
      .map((g) => (
        <GameCard
          key={g.id}
          g={g}
          {...gameCardProps}
          roundResults={g.roundResults || []}
        />
      ))}
      </div>
    )}

    {showCancelled && cancelledGames.length > 0 && (
      <div style={{ marginTop: 16 }}>
        <h3>❌ Cancelled ({cancelledGames.length})</h3>
        {cancelledGames.map((g) => (
          <GameCard key={g.id} g={g} {...gameCardProps} roundResults={g.roundResults || []} />
        ))}
      </div>
    )}

    {showArchive && archivedSettled.length > 0 && (
      <div style={{ marginTop: 20, opacity: 0.7 }}>
        <h3>📦 Archive ({archivedSettled.length})</h3>
        {archivedSettled.map((g) => (
          <GameCard key={g.id} g={g} {...gameCardProps} roundResults={g.roundResults || []} />
        ))}
      </div>
    )}
  </div>

  {/* ---------------- LEADERBOARD ---------------- */}
  <div style={{ gridColumn: 4, marginTop: 0 }}>
    <h2
      style={{
        color: "#18bb1a",
        fontWeight: "bold",
        fontSize: 26,
        textTransform: "uppercase",
        textShadow: "0 0 8px #18bb1a, 0 0 16px #18bb1a",
        marginBottom: 12,
      }}
    >
      🏆 Top 10 Leaderboard
    </h2>

    <div
      style={{
        background: "#111",
        padding: 16,
        borderRadius: 12,
        border: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          fontSize: 13,
          opacity: 0.7,
          borderBottom: "1px solid #333",
          paddingBottom: 6,
          marginBottom: 6,
        }}
      >
        <span>Player</span>
        <span>P</span>
        <span>W</span>
        <span>%</span>
      </div>

      {/* No leaderboard */}
      {leaderboard.length === 0 && (
        <div style={{ opacity: 0.6, padding: "8px 0", textAlign: "center" }}>
          No settled games yet.
        </div>
      )}

      {/* Leaderboard entries */}
      {leaderboard.map((entry, index) => {
        let medalColor = "#fff";
        if (index === 0) medalColor = "#FFD700";
        if (index === 1) medalColor = "#C0C0C0";
        if (index === 2) medalColor = "#CD7F32";

        const isCurrentUser = entry.address === account?.toLowerCase();

        return (
          <div
            key={entry.address}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "6px 0",
              borderBottom: "1px solid #222",
              fontSize: 14,
              color: isCurrentUser ? "#4da3ff" : medalColor,
              fontWeight: isCurrentUser ? "bold" : "normal",
              transition: "background 0.2s",
              cursor: "default",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#222")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span>
              #{index + 1} — {entry.address.slice(0, 6)}…{entry.address.slice(-4)}
            </span>
            <span style={{ textAlign: "center" }}>{entry.played}</span>
            <span style={{ textAlign: "center" }}>{entry.wins}</span>
            <span style={{ textAlign: "center" }}>{entry.winRate}%</span>
          </div>
        );
      })}
    </div>
{/* ---------------- TOTAL CORE BURNED ---------------- */}
<div
  style={{
    marginTop: 20,
    background: "#111",
    padding: 18,
    borderRadius: 12,
    border: "1px solid #333",
    textAlign: "center",
    boxShadow: "0 0 12px rgba(24,187,26,0.15)",
  }}
>
  <div
    style={{
      fontSize: 14,
      opacity: 0.7,
      marginBottom: 6,
      letterSpacing: 1,
    }}
  >
    TOTAL CORE BURNED FROM CORE CLASH
  </div>

  <div
    style={{
      fontSize: 28,
      fontWeight: "bold",
      color: "#bb6918",
      textShadow: "0 0 8px #cd3309, 0 0 16px #cd3309",
    }}
  >
    {totalGameBurned.toFixed(2)} CORE
  </div>

  <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
    {burnPercent.toFixed(4)}% of total supply
  </div>
</div>
</div>
</div>
    </div>
  );
}