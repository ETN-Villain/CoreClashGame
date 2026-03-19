/* eslint-disable no-unused-vars */

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { ethers } from "ethers";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { getSdkError } from '@walletconnect/utils';
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
  RPC_URL,
} from "./config.js";

import mapping from "./mapping.json";
import { renderTokenImages } from "./renderTokenImages.jsx";

import {
  CoreClashLogo, AppBackground, PlanetZephyrosAE, HowToPlay, GameInfo, ElectroSwap,
  VerdantKinBanner, ElectroneumLogo,
} from "./appMedia/media.js";

import GameCard from "./gameCard.jsx";

export default function App() {
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

const [showHowToPlay, setShowHowToPlay] = useState(false);
const [showGameInfo, setShowGameInfo] = useState(false);
const [helpModal, setHelpModal] = useState(null);
const [showOwnershipWarning, setShowOwnershipWarning] = useState(false);

/* ---------------- WALLET STATE ---------------- */
const [provider, setProvider] = useState(null);  // Unified provider
const [signer, setSigner] = useState(null);
const [account, setAccount] = useState(null);
const [walletError, setWalletError] = useState(null);
const [wcProvider, setWcProvider] = useState(null);

/* ---------------- PROVIDER MEMO ---------------- */
const unifiedProvider = useMemo(() => {
  return new ethers.JsonRpcProvider(RPC_URL);
}, []);

/* ---------------- CONTRACTS ---------------- */
const gameContract = useMemo(() => {
  if (!unifiedProvider) return null;
  return new ethers.Contract(GAME_ADDRESS, GameABI, signer ?? unifiedProvider);
}, [unifiedProvider, signer]);

const erc20 = useMemo(() => {
  if (!provider || !stakeToken) return null;
  return new ethers.Contract(stakeToken, ERC20ABI, signer ?? provider);
}, [provider, signer, stakeToken]);

const coreContract = useMemo(() => {
  if (!provider) return null;
  return new ethers.Contract(CORE_TOKEN, ERC20ABI, signer ?? provider);
}, [provider, signer]);

useEffect(() => {
  if (!unifiedProvider) {
    setProvider(new ethers.JsonRpcProvider(RPC_URL));
  }
}, [unifiedProvider]);

/* ---------------- NFT STATE ---------------- */
const [ownedNFTs, setOwnedNFTs] = useState([]);
const [nfts, setNfts] = useState([
  { address: "", tokenId: null, tokenURI: null, metadata: null },
  { address: "", tokenId: null, tokenURI: null, metadata: null },
  { address: "", tokenId: null, tokenURI: null, metadata: null },
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

  /* ---------------- GAMES STATE ---------------- */
  const [games, setGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [showResolved, setShowResolved] = React.useState(true);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [pendingAutoRevealGameId, setPendingAutoRevealGameId] = useState(null);
  const [activeTab, setActiveTab] = useState("open");

  /* ---------------- LOADING SCREEN ---------------- */
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [progress, setProgress] = useState(0);
  
  /* ---------------- HANDLE GAMECREATED EVENT ---------------- */
  const [showDeviceWarning, setShowDeviceWarning] = useState(false);
  const [deviceConfirmed, setDeviceConfirmed] = useState(false);

/* ---------------- LOADING BAR ---------------- */
useEffect(() => {
  if (!loading) return;

  const duration = 5000; // 5 seconds
  const intervalTime = 50; // smooth animation
  const step = 100 / (duration / intervalTime);

  const timer = setInterval(() => {
    setProgress((prev) => {
      if (prev >= 100) {
        clearInterval(timer);
        setLoading(false);
        return 100;
      }
      return prev + step;
    });
  }, intervalTime);

  return () => clearInterval(timer);
}, [loading]);

  /* ---------------- CONNECT WALLET ---------------- */
const connectMetamask = useCallback(async () => {
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

const disconnectWallet = useCallback(async () => {
  setAccount(null);
  setSigner(null);
  setProvider(null);
  setWalletError(null);

  if (wcProvider) {
    try {
      await wcProvider.disconnect();  // ← Simple, no reason/topic needed
    } catch (e) {
      console.warn('WC disconnect error (harmless):', e);
    }
    setWcProvider(null);
  }
}, [wcProvider]);

/* ------- WALLET CONNECT ----------- */
const connectWalletConnect = useCallback(async () => {
  setWalletError(null); // Clear previous errors

  if (wcProvider) {
    // Disconnect existing session before starting a new one
    await disconnectWallet();
  }

  try {
    const projectId = "146ee334d324044083b6427d4bbf9202";

    // Init WalletConnect provider with custom RPC
    const ethereumProvider = await EthereumProvider.init({
      projectId,
      chains: [52014],
      optionalChains: [52014],
      rpcMap: {
        52014: "https://rpc.ankr.com/electroneum" // Your RPC URL
      },
      showQrModal: true,
      metadata: {
        name: "Core Clash Trading Card Game",
        description: "Core Clash — A strategic NFT battle game powered by Electroneum 2.0",
        url: window.location.origin,
        icons: [CoreClashLogo], // must be full URL
      },
  qrcodeModalOptions: {
    top: "10px",           // move modal from bottom to top
    left: "50%",           // center horizontally
    transform: "translateX(-50%)",
    width: "300px",
    height: "300px",
  }
    });

    // ✅ Enable WalletConnect session
    await ethereumProvider.enable();

    // Wrap as ethers v6 BrowserProvider
    const newProv = new ethers.BrowserProvider(ethereumProvider);
    const newSigner = await newProv.getSigner();
    const addr = await newSigner.getAddress();

    // Save to state
    setProvider(newProv);
    setSigner(newSigner);
    setAccount(addr);
    setWalletError(null);
    setWcProvider(ethereumProvider); // For cleanup

  } catch (err) {
    console.error("WalletConnect connection failed:", err);

    if (err?.code === 4001 || err?.message?.includes("reject") || err?.message?.includes("user rejected")) {
      setWalletError("Connection rejected by user");
    } else {
      setWalletError("Failed to connect via WalletConnect – please try again");
    }
  }
}, [wcProvider, disconnectWallet, setWalletError, setProvider, setSigner, setAccount]);

/* ---------------- RESTORE WALLET ---------------- */
useEffect(() => {
  let isMounted = true; // Prevent state updates after unmount

  const restoreWallet = async () => {
    if (!isMounted) return;

    // --- Step 1: Try injected wallet (MetaMask, etc.) ---
    if (window.ethereum) {
      try {
        const prov = new ethers.BrowserProvider(window.ethereum);
        const accounts = await prov.send("eth_accounts", []); // silent check
        if (accounts?.length > 0) {
          const signer = await prov.getSigner();
          if (isMounted) {
            setProvider(prov);
            setSigner(signer);
            setAccount(await signer.getAddress());
            setWalletError(null);
          }
          return; // prefer injected if available
        }
      } catch (err) {
        console.warn("Injected provider restore failed:", err);
      }
    }

    // --- Step 2: Try WalletConnect session restore ---
    try {
      const projectId = "146ee334d324044083b6427d4bbf9202";

      // Init WalletConnect provider
      const wcProvider = await EthereumProvider.init({
        projectId,
        chains: [52014],
        optionalChains: [52014],
        // No showQrModal → silent restore
        rpcMap: {
          52014: "https://rpc.ankr.com/electroneum",
        },
      });

      // Check if a session exists
      if (wcProvider.connected || wcProvider.session) {
        const prov = new ethers.BrowserProvider(wcProvider);
        const accounts = await prov.send("eth_accounts", []);
        if (accounts?.length > 0) {
          const signer = await prov.getSigner();
          if (isMounted) {
            setProvider(prov);
            setSigner(signer);
            setAccount(await signer.getAddress());
            setWalletError(null);
            setWcProvider(wcProvider);
          }
          return;
        } else {
          // No accounts → disconnect stale session
          await wcProvider.disconnect().catch(() => {});
        }
      }
    } catch (wcErr) {
      console.warn("WalletConnect restore failed:", wcErr);
    }

    // --- Step 3: Fallback: read-only provider ---
    if (isMounted) {
      setProvider(new ethers.JsonRpcProvider("https://rpc.ankr.com/electroneum"));
      setSigner(null);
      setAccount(null);
      setWalletError(null);
    }
  };

  restoreWallet();

  // --- Optional: Listen to injected wallet changes ---
  const handleAccountsChanged = () => window.location.reload();
  const handleChainChanged = () => window.location.reload();
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
  }

  // Cleanup
  return () => {
    isMounted = false;
    if (window.ethereum) {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    }
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
const readProvider = unifiedProvider || new ethers.JsonRpcProvider("https://rpc.ankr.com/electroneum");
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, readProvider);

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
}, [unifiedProvider]);

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

  if (!stakeToken || !stakeAmount || nfts.some(n => !n.address || !n.tokenId)) {
    alert("All fields must be completed before creating a game");
    return;
  }

  try {
    // ✅ Contract instance for writes
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    /* ---------- Prepare ERC20 read provider ---------- */
    const readProvider = unifiedProvider || new ethers.JsonRpcProvider(RPC_URL);
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, readProvider);
    const stakeWei = ethers.parseUnits(stakeAmount, 18);

    // declare allowance in outer scope
    let allowance;
    try {
      allowance = await erc20.allowance(account, GAME_ADDRESS);
    } catch (err) {
      console.error("Allowance check failed:", err);
      throw new Error(
        "Could not read allowance. Check WalletConnect session, network, or RPC URL."
      );
    }

    // If allowance insufficient → send approve via signer
    if (allowance < stakeWei) {
      const approveTx = await erc20.connect(signer).approve(GAME_ADDRESS, stakeWei);
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
  unifiedProvider,
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
  .filter(g => g.settledAt)
  .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));

const latestSettled = sortedSettledGames.slice(0, 10);
const archivedSettled = sortedSettledGames.slice(10);

/* ---------------- LEADERBOARD ---------------- */
const [showWeekly, setShowWeekly] = useState(false);

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

/* ---------------- WEEKLY LEADERBOARD (Top 3, fixed weeks) ---------------- */
const [weeklyHistory, setWeeklyHistory] = useState({ latest: [], week: null });
const weeklyLeaderboard = weeklyHistory.latest || [];

// Fetch weekly leaderboard from backend
useEffect(() => {
fetch(`${BACKEND_URL}/leaderboard/weekly`)
    .then(res => res.json())
    .then(data => {
      const weeks = Object.keys(data).sort((a, b) => new Date(b) - new Date(a));
      const latestWeek = weeks[0];
      const top3 = data[latestWeek] || [];
      setWeeklyHistory({ latest: top3, week: latestWeek });
    })
    .catch(console.error);
}, []);

/* --------- TOTAL CORE BURN ---------*/
const [totalGameBurned, setTotalGameBurned] = useState(0);
const [burnPercent, setBurnPercent] = useState(0);

useEffect(() => {
  let interval;

  const fetchBurn = async () => {
    try {
      // 1️⃣ Always fetch backend total burn
      const res = await fetch(`${BACKEND_URL}/games/burn-total`);
      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
      const data = await res.json();

      const burnWei = BigInt(data.totalBurnWei);
      const burnFormatted = Number(ethers.formatEther(burnWei));

     // Use default provider if wallet is not connected
      const provider = new ethers.JsonRpcProvider(process.env.REACT_APP_RPC_URL);
      const coreReadContract = new ethers.Contract(CORE_TOKEN, ERC20ABI, provider);
      const supplyWei = await coreReadContract.totalSupply();
      const supplyFormatted = Number(ethers.formatEther(supplyWei));

      const percent =
        supplyFormatted > 0 ? (burnFormatted / supplyFormatted) * 100 : 0;

      setTotalGameBurned(burnFormatted);
      setBurnPercent(percent);
    } catch (err) {
      console.error("Burn refresh failed:", err);
    }
  };

  // Run immediately
  fetchBurn();

  // Then run every 30 seconds
  interval = setInterval(fetchBurn, 30000);

  // Cleanup
  return () => clearInterval(interval);
}, []);

/* ---------------- UI ---------------- */
const isMobile = window.innerWidth < 768;

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
          textAlign: "center",
        }}
      >
        <img
          src={CoreClashLogo}
          alt="Core Clash"
          style={{ width: "90%", maxWidth: 500,}}        />

        {/* Powered By */}
        <p
          style={{
            marginTop: 20,
            fontSize: isMobile ? 14: 18,
            letterSpacing: 3,
            textTransform: "uppercase",
            opacity: 0.8,
          }}
        >
          Powered by
        </p>

        {/* New Image */}
        <img
          src={ElectroneumLogo}   // 👈 replace with your image variable
          alt="Electroneum"
          style={{
            width: 250,
            maxWidth: "60%",
            marginBottom: 30,
          }}
        />

{/* Loading Bar */}
<div
  style={{
    width: "60%",
    maxWidth: 400,
    height: 12,
    backgroundColor: "#0f2e10",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow: "0 0 10px #18bb1a55",
  }}
>
  <div
    style={{
      width: `${progress}%`,
      height: "100%",
      background: "linear-gradient(90deg, #18bb1a, #42ff5a)",
      transition: "width 50ms linear",
    }}
  />
</div>
      </div>
    </div>
  );
}

/* ---------------- MAIN APP ---------------- */
return (
<div
  style={{
    position: "relative",
    minHeight: "100vh",
    padding: isMobile ? "16px 14px" : 40,
    width: "100%",
    maxWidth: 1100,
    margin: "0 auto",
    boxSizing: "border-box",
    minWidth: 0,
  }}
>
    {/* ---------------- WATERMARK ---------------- */}
<div
  style={{
    position: "fixed",
    inset: 0,
    backgroundColor: "#000",
    backgroundImage: `url(${AppBackground})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    backgroundPosition: "center",
    opacity: 0.40,
    pointerEvents: "none",
    zIndex: 0,
  }}
 />

    {/* ---------------- APP CONTENT ---------------- */}
    <div style={{ position: "relative", zIndex: 1 }}>

{/* ---------------- HEADER: LOGO + WALLET ---------------- */}
<div
  style={{
    display: "flex",
    alignItems: "center",       // vertical alignment
    justifyContent: "space-between",
    gap: isMobile ? 12 : 24,
    width: "100%",
    padding: 0,
  }}
>
  {/* LEFT: Logo */}
  <img
    src={CoreClashLogo}
    alt="Core Clash"
    style={{
      height: isMobile ? 80 : 80,
      width: "auto",
      pointerEvents: "none",
      display: "block",
    }}
  />

  {/* RIGHT: Wallet Section */}
  {!account ? (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: "center",
        gap: isMobile ? 10 : 16,
      }}
    >
      <button
        onClick={() => {
          setWalletError(null);
          connectMetamask();
        }}
        style={{
          backgroundColor: "#18bb1a",
          color: "#fff",
          border: "none",
          padding: isMobile ? "10px 16px" : "14px 28px",
          fontSize: isMobile ? 14 : 16,
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
        Connect MetaMask
      </button>

      <button
        onClick={() => {
          setWalletError(null);
          connectWalletConnect();
        }}
        style={{
          backgroundColor: "#1a75ff",
          color: "#fff",
          border: "none",
          padding: isMobile ? "10px 16px" : "14px 28px",
          fontSize: isMobile ? 14 : 16,
          fontWeight: "bold",
          borderRadius: 12,
          cursor: "pointer",
          boxShadow: "0 0 10px rgba(26,117,255,0.6)",
          transition: "all 0.2s ease",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.boxShadow = "0 0 20px rgba(26,117,255,0.9)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.boxShadow = "0 0 10px rgba(26,117,255,0.6)")
        }
      >
        Connect Mobile (WalletConnect)
      </button>
    </div>
  ) : (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#0f0f0f",
          padding: "6px 12px",
          borderRadius: 12,
          border: "1px solid #333",
          boxShadow: "0 0 8px rgba(0,0,0,0.4)",
        }}
      >
        <span
          style={{
            fontSize: isMobile ? 12 : 14,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: 0.3,
          }}
        >
          {account?.slice(0, 6)}...{account?.slice(-4)}
        </span>

        <div
          style={{
            width: 1,
            height: 16,
            background: "#333",
          }}
        />

        <button
          onClick={disconnectWallet}
          style={{
            background: "transparent",
            border: "none",
            color: "#ff6b6b",
            fontWeight: 600,
            fontSize: isMobile ? 11 : 13,
            cursor: "pointer",
            padding: "2px 6px",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff3b3b")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#ff6b6b")}
        >
          Disconnect
        </button>
      </div>
    </div>
  )}
</div>

{/* ---------------- ECOSYSTEM BLOCK ---------------- */}
<div
  style={{
    marginTop: 16,
    width: "100%",
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1.4fr 1fr",
    gap: 14,
    alignItems: "center",
    justifyItems: "center",
  }}
>
  {/* Buy CORE */}
  <a
    href="https://app.electroswap.io/explore/tokens/electroneum/0x309b916b3a90cb3e071697ea9680e9217a30066f?inputCurrency=ETN"
    target="_blank"
    rel="noopener noreferrer"
    style={{ textDecoration: "none", width: "100%", maxWidth: 140 }}
  >
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #333",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        boxShadow: "0 0 8px rgba(0,0,0,0.5)",
        transition: "all 0.2s ease",
      }}
    >
      <img src={ElectroSwap} alt="Buy CORE" style={{ width: 34, height: 34, borderRadius: 6 }} />
      <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 600, color: "#fff" }}>
        Buy CORE
      </span>
    </div>
  </a>

  {/* Planet ETN */}
  <a
    href="https://planetetn.org/zephyros"
    target="_blank"
    rel="noopener noreferrer"
    style={{ textDecoration: "none", width: "100%", maxWidth: 140 }}
  >
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #333",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        boxShadow: "0 0 8px rgba(0,0,0,0.5)",
        transition: "all 0.2s ease",
      }}
    >
      <video
        src={PlanetZephyrosAE}
        autoPlay
        loop
        muted
        playsInline
        style={{ width: 38, height: 38, borderRadius: 6, objectFit: "cover" }}
      />
      <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 600, color: "#fff" }}>
        Planet ETN
      </span>
    </div>
  </a>

  {/* Verdant Kin Banner */}
  <a
    href="https://app.electroswap.io/nfts/collection/0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      textDecoration: "none",
      width: "100%",
      maxWidth: isMobile ? "100%" : 280, // optional max width on desktop
      gridColumn: isMobile ? "1 / span 2" : undefined, // span two columns on mobile
    }}
  >
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #333",
        borderRadius: 12,
        width: "100%",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 8px rgba(0,0,0,0.5)",
        transition: "all 0.2s ease",
      }}
    >
      <img
        src={VerdantKinBanner}
        alt="Verdant Kin"
        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }}
      />
    </div>
  </a>
</div>

<div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 24,
    alignItems: "flex-start",
    minWidth: 0, // allows children to shrink
  }}
>
  {/* ---------------- TOTAL CORE BURNED ---------------- */}
<div
  style={{
    marginTop: 20,
    width: isMobile ? "100%" : undefined,
    padding: "16px 12px",
    background: "#111",
    borderRadius: 12,
    border: "1px solid #333",
    textAlign: "center",
    boxShadow: "0 0 12px rgba(24,187,26,0.15)",
  }}
>
  {/* Label */}
  <div
    style={{
      fontSize: isMobile ? 12 : 14,
      opacity: 0.75,
      marginBottom: 6,
      letterSpacing: 1,
      textTransform: "uppercase",
      color: "#ccc",
    }}
  >
    Total Core Burned from Core Clash
  </div>

  {/* Main Number */}
  <div
    style={{
      fontSize: isMobile ? 28 : 36,
      fontWeight: 700,
      color: "#ff9a3c",
      textShadow: "0 0 6px #ff6b00, 0 0 12px #ff6b00",
      marginBottom: 4,
    }}
  >
    🔥 {totalGameBurned.toFixed(2)} CORE 🔥
  </div>

  {/* Percentage */}
  <div
    style={{
      fontSize: isMobile ? 12 : 14,
      opacity: 0.7,
      color: "#aaa",
      letterSpacing: 0.5,
    }}
  >
    {burnPercent.toFixed(4)}% of total supply
  </div>
</div>

{/* ---------------- CREATE GAME SECTION ---------------- */}
<div
  style={{
    width: "100%",
    flex: 1,
    background: "#111",
    border: "1px solid #333",
    borderRadius: 12,
    padding: isMobile ? "12px 10px" : "16px 16px",
    boxShadow: "0 0 12px rgba(24,187,26,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }}
>

  {/* HEADER ROW */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 6,
    }}
  >

    <h2
      style={{
        fontSize: isMobile ? 18 : 22,
        color: "#18bb1a",
        margin: 0,
      }}
    >
      Create Game
    </h2>

    {/* HELP BUTTONS */}
    <div
      style={{
        display: "flex",
        gap: 6,
      }}
    >
      <button
        onClick={() => setHelpModal("how")}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #333",
          background: "#0f0f0f",
          color: "#18bb1a",
          fontSize: 12,
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        How To Play
      </button>

      <button
        onClick={() => setHelpModal("info")}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #333",
          background: "#0f0f0f",
          color: "#18bb1a",
          fontSize: 12,
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        Game Info
      </button>
    </div>

  </div>

  {/* Stake Token */}
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 12, color: "#aaa", fontWeight: 600, textTransform: "uppercase" }}>
      Stake Token
    </label>
    <select
      value={stakeToken}
      onChange={(e) => setStakeToken(e.target.value)}
      style={{
        width: "100%",
        maxWidth: 260,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #333",
        background: "#0f0f0f",
        color: "#fff",
        fontSize: 14,
        outline: "none",
        cursor: "pointer",
      }}
    >
      {WHITELISTED_TOKENS.map((t) => (
        <option key={t.address} value={t.address}>
          {t.label}
        </option>
      ))}
    </select>
  </div>

  {/* Stake Amount */}
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 12, color: "#aaa", fontWeight: 600, textTransform: "uppercase" }}>
      Stake Amount
    </label>
    <input
      value={stakeAmount}
      onChange={(e) => setStakeAmount(e.target.value)}
      type="number"
      placeholder="Enter amount"
      style={{
        width: "100%",
        maxWidth: 220,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #333",
        background: "#0f0f0f",
        color: "#fff",
        fontSize: 14,
        outline: "none",
      }}
    />
  </div>

  <h3
    style={{
      fontSize: isMobile ? 16 : 18,
      color: "#18bb1a",
      marginTop: 16,
      marginBottom: 8,
    }}
  >
    Your Clash Team (3)
  </h3>

{/* ---------------- NFT GALLERY ---------------- */}
<div style={{ marginBottom: 40 }}>
  {nfts.map((slot, i) => (
    <div
      key={i}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 16,
        minWidth: 0,
      }}
    >
      <label
        style={{
          fontSize: 12,
          color: "#aaa",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Select NFT
      </label>

      {/* Scrollable NFT row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          flexWrap: "nowrap",
          paddingBottom: 4,
          scrollSnapType: "x mandatory",
          maxWidth: "100%",
        }}
      >
        {ownedNFTs.map((nftOption) => {
          const selected = nfts[i]?.tokenId === nftOption.tokenId;
          const collectionKey =
            WHITELISTED_NFTS.find(
              (x) =>
                x.address?.toLowerCase() === nftOption.nftAddress?.toLowerCase()
            )?.label === "Verdant Kin"
              ? "VKIN"
              : "VQLE";

          const mapped = nftOption.tokenId && collectionKey ? mapping[collectionKey]?.[String(nftOption.tokenId)] : null;
          const imageFile = mapped
            ? mapped.image_file || mapped.token_uri?.replace(/\.json$/i, ".png") || `${nftOption.tokenId}.png`
            : `${nftOption.tokenId}.png`;

          const imageSrc = imageFile && collectionKey ? `${BACKEND_URL}/images/${collectionKey}/${imageFile}` : "/placeholder.png";

          return (
            <div
              key={`${nftOption.nftAddress}-${nftOption.tokenId}`}
              onClick={() => {
                setNfts((prev) =>
                  prev.map((slot, idx) => {
                    if (idx === i) {
                      return {
                        ...slot,
                        tokenId: nftOption.tokenId,
                        metadata: { name: nftOption.name, background: nftOption.background },
                        tokenURI: nftOption.tokenURI,
                        address: nftOption.nftAddress,
                      };
                    } else if (
                      slot.tokenId === nftOption.tokenId &&
                      slot.address?.toLowerCase() === nftOption.nftAddress?.toLowerCase()
                    ) {
                      return { ...slot, tokenId: null, metadata: {}, tokenURI: null, address: null };
                    }
                    return slot;
                  })
                );
              }}
              style={{
                flex: "0 0 auto",
                width: 90,
                minWidth: 90,
                scrollSnapAlign: "start",
                cursor: "pointer",
                borderRadius: 8,
                border: selected ? "2px solid #3ea6ff" : "1px solid #333",
                background: "#111",
                padding: 6,
                textAlign: "center",
                boxSizing: "border-box",
                userSelect: "none",
              }}
            >
              <img
                src={imageSrc}
                alt={`${collectionKey} #${nftOption.tokenId}`}
                onError={(e) => (e.currentTarget.src = "/placeholder.png")}
                style={{
                  width: "100%",
                  height: 70,
                  objectFit: "cover",
                  borderRadius: 6,
                  marginBottom: 4,
                  display: "block",
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {nftOption.name ? `${nftOption.name} (#${nftOption.tokenId})` : `#${nftOption.tokenId}`}
              </div>
              <div
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {nftOption.background}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ))}
</div>

{/* ---------------- STATUS ---------------- */}
<div
  style={{
    display: "flex",
    flexWrap: "wrap",        // allow items to wrap on narrow screens
    gap: 8,                   // small spacing between items
    fontSize: isMobile ? 12 : 14,
    color: "#aaa",
    marginTop: 12,
  }}
>
  <span>signer: {signer ? "✅" : "❌"}</span>
  <span>validated: {validated ? "✅" : "❌"}</span>
  <span>stakeToken: {stakeToken || "❌"}</span>
  <span>stakeAmount: {stakeAmount || "❌"}</span>
</div>

{/* ---------------- ACTION BUTTONS ---------------- */}
<div
  style={{
    width: "100%",
    marginTop: 12,      // slightly tighter
    marginBottom: 12,   // reduced bottom space
    display: "flex",
    gap: isMobile ? 8 : 12, // smaller gap on mobile
    flexWrap: "wrap",
    justifyContent: isMobile ? "center" : "flex-start",
    boxSizing: "border-box",
  }}
>
{/* NFT OWNERSHIP WARNING */}
<div
  style={{
    border: "1px solid #6b4a00",
    borderRadius: 8,
    background: "#1a1200",
    marginBottom: 8,
    overflow: "hidden",
  }}
>

  {/* Header */}
  <div
    onClick={() => setShowOwnershipWarning(!showOwnershipWarning)}
    style={{
      padding: "8px 10px",
      fontSize: isMobile ? 12 : 13,
      color: "#ffcc66",
      fontWeight: "bold",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    ⚠ NFT Ownership Warning
    <span style={{ opacity: 0.7 }}>
      {showOwnershipWarning ? "▲" : "▼"}
    </span>
  </div>

  {/* Expandable Content */}
  {showOwnershipWarning && (
    <div
      style={{
        padding: "8px 10px",
        fontSize: isMobile ? 11 : 12,
        color: "#ffcc66",
        lineHeight: 1.4,
        borderTop: "1px solid #6b4a00",
      }}
    >
      Remove all playing NFTs from marketplace listings. If you do not own the NFT
      at <strong>Reveal</strong>, your reveal file will fail as you no longer own
      the NFT. This will result in a <strong>forfeited game</strong> and you will
      lose your stake.
    </div>
  )}

</div>

  {/* Validate Team Button */}
  <button
onClick={validateTeam} // <-- THIS IS REQUIRED
    style={{
      flex: isMobile ? "1 1 100%" : "1 1 auto",
      minWidth: isMobile ? 0 : 140,
      maxWidth: 200,
      padding: isMobile ? "10px 0" : "14px 0", // slightly tighter vertical padding
      fontSize: isMobile ? 14 : 16,
      fontWeight: "bold",
      borderRadius: 12,
      border: "none",
      background: validating ? "#555" : "linear-gradient(90deg, #1affb3, #00c6ff)",
      color: "#111",
      cursor: validating ? "not-allowed" : "pointer",
      boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
      transition: "transform 0.1s ease, box-shadow 0.2s ease",
    }}
  >
    {validating ? "Validating..." : "Validate Team"}
  </button>

  {/* Create Game Button */}
  <button
onClick={createGame} // <-- THIS IS REQUIRED    
  style={{
      flex: isMobile ? "1 1 100%" : "1 1 auto",
      minWidth: isMobile ? 0 : 140,
      maxWidth: 200,
      padding: isMobile ? "10px 0" : "14px 0", // slightly tighter vertical padding
      fontSize: isMobile ? 14 : 16,
      fontWeight: "bold",
      borderRadius: 12,
      border: "none",
      background:
        !validated || !stakeToken || !stakeAmount || !signer
          ? "#555"
          : "linear-gradient(90deg, #ff7a00, #ff3d00)",
      color: "#fff",
      cursor:
        !validated || !stakeToken || !stakeAmount || !signer
          ? "not-allowed"
          : "pointer",
      boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
      transition: "transform 0.1s ease, box-shadow 0.2s ease",
    }}
  >
    Create Game
  </button>
</div>

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

<div style={{ marginTop: 40, marginBottom: 10 }}>
  <h2
    style={{
      fontWeight: "bold",
      fontSize: isMobile ? 26 : 30,
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
    padding: isMobile ? "6px 12px" : "8px 16px",
    borderRadius: 4,
    cursor: loadingGames ? "not-allowed" : "pointer",
    fontSize: isMobile ? 13 : 16,
    opacity: loadingGames ? 0.6 : 1,
  }}
>
  🔄 Refresh Games
</button>
</div>

<div
  style={{
    display: isMobile ? "flex" : "grid",
    flexDirection: isMobile ? "column" : undefined,
    gridTemplateColumns: isMobile
      ? "1fr"
      : "repeat(2, minmax(0, 1fr))",
    gap: 20,
  }}
>

{showDeviceWarning && (
  <div
    style={{
      position: "fixed",
      top: 20,        // small offset from top
      left: 20,       // small offset from left
      zIndex: 99999,
      maxWidth: "400px",
      width: "90%",
      backgroundColor: "#18bb1a",
      borderRadius: "12px",
      padding: isMobile ? "15px 20px" : "20px 30px",
      boxShadow: "0 0 20px rgba(255, 255, 255, 0.99)",
      fontSize: isMobile ? "14px" : "16px",
    }}
  >
    <h3 style={{ marginTop: 0 }}>⚠ Important: Reveal File Backup</h3>

    <p>
      If you are using <b>MetaMask Mobile</b>, the reveal file will NOT
      automatically download.
    </p>

    <p>
      If the reveal file is not saved, you will be unable to reveal and
      will forfeit the game and your stake.
    </p>

    <p style={{ fontSize: isMobile ? 12 : 14, opacity: 0.8 }}>
      By continuing, you confirm that you understand this risk and have
      ensured your reveal file can be securely saved.
    </p>

    <div style={{ marginTop: 15, display: "flex", gap: "10px" }}>
      <button
        onClick={() => {
          setDeviceConfirmed(true);
          setShowDeviceWarning(false);
          createGame();
        }}
        style={{
          backgroundColor: "#1a75ff",
          color: "#fff",
          border: "none",
          padding: isMobile ? "8px 15px" : "12px 20px",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        I Understand – Continue
      </button>

      <button
        onClick={() => setShowDeviceWarning(false)}
        style={{
          padding: isMobile ? "8px 15px" : "12px 20px",
          borderRadius: 8,
          cursor: "pointer",
          border: "1px solid #ccc",
          backgroundColor: "#f9f9f9",
        }}
      >
        Cancel
      </button>
    </div>
  </div>
)}

{/* ---------------- GAMES GRID CONTAINER ---------------- */}
{(!isMobile || account) && ( // desktop always renders here; mobile uses tabs
  <div style={{ width: "100%", minWidth: 0, marginTop: isMobile ? 0 : 40 }}>
{/* ---------------- TABS (MOBILE ONLY) ---------------- */}
  {isMobile && (
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
    marginBottom: 16,
  }}
>      {[
        { key: "open", label: `Open (${openGames.length})` },
        { key: "active", label: `Active (${activeGames.length})` },
        { key: "settled", label: `Settled (${latestSettled.length})` },
        { key: "leaderboard", label: "Leaderboard" },
      ].map((tab) => (
<button
  key={tab.key}
  onClick={() => setActiveTab(tab.key)}
  style={{
    padding: "8px 6px", // tighter padding
    borderRadius: 8,
    border: "1px solid #333",
    background: activeTab === tab.key ? "#18bb1a" : "#111",
    color: activeTab === tab.key ? "#000" : "#fff",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: 12, // slightly smaller
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }}
>
      {tab.label}
        </button>
      ))}
    </div>
  )}

    {/* DESKTOP GRID */}
<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1.3fr", gap: 20, flex: 3 }}>
    {/* OPEN */}
      {(!isMobile || activeTab === "open") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, width: "100%" }}>
          <h3>🟢 Open ({openGames.length})</h3>
{openGames.map((g) => (
  <div style={{ width: "100%" }}>
    <GameCard
      key={g.id}
      g={g}
      {...gameCardProps}
      roundResults={g.roundResults || []}
    />
  </div>
))}
        </div>
      )}

      {/* ACTIVE */}
      {(!isMobile || activeTab === "active") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, width: "100%" }}>
          <h3>🟡 Active ({activeGames.length})</h3>
{activeGames.map((g) => (
  <div style={{ width: "100%" }}>
    <GameCard
      key={g.id}
      g={g}
      {...gameCardProps}
      roundResults={g.roundResults || []}
    />
  </div>
))}        </div>
      )}

{/* SETTLED */}
{(!isMobile || activeTab === "settled") && (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      width: "100%",
      minWidth: 0,
    }}
  >
    <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
      <label>
        <input type="checkbox" checked={showResolved} onChange={() => setShowResolved(v => !v)} /> Settled
      </label>
      <label>
        <input type="checkbox" checked={showCancelled} onChange={() => setShowCancelled(v => !v)} /> Cancelled
      </label>
      <label>
        <input type="checkbox" checked={showArchive} onChange={() => setShowArchive(v => !v)} /> Archive
      </label>
    </div>

    {showResolved && latestSettled.length > 0 && (
      <div style={{ width: "100%", minWidth: 0 }}>
        <h3>🔵 Settled ({latestSettled.length})</h3>
        {[...latestSettled]
          .sort((a, b) => Number(b.settledAt) - Number(a.settledAt))
          .map((g) => (
            <div key={g.id} style={{ width: "100%" }}>
              <GameCard
                g={g}
                {...gameCardProps}
                roundResults={g.roundResults || []}
              />
            </div>
          ))}
      </div>
    )}

    {showCancelled && cancelledGames.length > 0 && (
      <div style={{ marginTop: 16, width: "100%", minWidth: 0 }}>
        <h3>❌ Cancelled ({cancelledGames.length})</h3>
        {cancelledGames.map((g) => (
          <div key={g.id} style={{ width: "100%" }}>
            <GameCard
              g={g}
              {...gameCardProps}
              roundResults={g.roundResults || []}
            />
          </div>
        ))}
      </div>
    )}

    {showArchive && archivedSettled.length > 0 && (
      <div style={{ marginTop: 20, opacity: 0.7, width: "100%", minWidth: 0 }}>
        <h3>📦 Archive ({archivedSettled.length})</h3>
        {archivedSettled.map((g) => (
          <div key={g.id} style={{ width: "100%" }}>
            <GameCard
              g={g}
              {...gameCardProps}
              roundResults={g.roundResults || []}
            />
          </div>
        ))}
      </div>
    )}
  </div>
)}

      {/* ---------------- LEADERBOARD ---------------- */}
      {(!isMobile || activeTab === "leaderboard") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1.5, minWidth: 280 }}>
            <input type="checkbox" id="weeklyToggle" checked={showWeekly} onChange={e => setShowWeekly(e.target.checked)} />
            <label htmlFor="weeklyToggle" style={{ fontSize: isMobile ? 14 : 16, color: "#fff", fontWeight: 500 }}>
              Show Weekly Top 3
            </label>
          </div>

      <h2 style={{
        color: "#18bb1a",
        fontWeight: "bold",
        fontSize: isMobile ? 26 : 30,
        textTransform: "uppercase",
        textShadow: "0 0 8px #18bb1a, 0 0 16px #18bb1a",
        marginBottom: 12,
      }}>
        {showWeekly ? "🏆 Weekly Top 3" : "🏆 All-Time Top 10"}
      </h2>

      <div style={{
        background: "#111",
        padding: isMobile ? 16 : 24,
        borderRadius: 12,
        border: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", fontSize: isMobile ? 13 : 16, opacity: 0.7, borderBottom: "1px solid #333", paddingBottom: 6, marginBottom: 6 }}>
          <span>Player</span>
          <span>P</span>
          <span>W</span>
          <span>%</span>
        </div>

        {/* Entries */}
        {(showWeekly ? weeklyHistory.latest || [] : leaderboard).map((entry,index)=>{
          const medalColor = ["#FFD700","#C0C0C0","#CD7F32"][index] || "#fff";
          const isCurrentUser = entry.address === account?.toLowerCase();
          return (
            <div key={entry.address+(showWeekly?"-weekly":"-alltime")} style={{
              display:"grid",
              gridTemplateColumns:"2fr 1fr 1fr 1fr",
              padding:isMobile?"6px 0":"8px 0",
              borderBottom:"1px solid #222",
              fontSize:isMobile?14:16,
              color:isCurrentUser?"#4da3ff":medalColor,
              fontWeight:isCurrentUser?"bold":"normal"
            }}>
              <span>#{index+1} — {entry.address.slice(0,6)}…{entry.address.slice(-4)}</span>
              <span style={{ textAlign: "center" }}>{entry.played}</span>
              <span style={{ textAlign: "center" }}>{entry.wins}</span>
              <span style={{ textAlign: "center" }}>{entry.winRate}%</span>
            </div>
          );
        })}

        {(showWeekly ? (weeklyHistory.latest?.length===0) : leaderboard.length===0) && (
          <div style={{ opacity: 0.6, padding:isMobile?"8px 0":"12px 0", textAlign:"center" }}>No games to display.</div>
        )}
      </div>
    </div>
  )}
</div>
</div>
)}

{/* ---------------- HELP MODAL ---------------- */}
{helpModal && (
  <div
    onClick={() => setHelpModal(null)}
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.7)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
      padding: 16,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "100%",
        maxWidth: 520,
        maxHeight: "80vh",
        overflowY: "auto",
        background: "#111",
        border: "1px solid #333",
        borderRadius: 12,
        padding: 20,
        color: "#ddd",
        boxShadow: "0 0 16px rgba(0,0,0,0.9)",
      }}
    >
     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ color: "#18bb1a", margin: 0 }}>
          {helpModal === "how" ? "How To Play" : "Game Info"}
        </h2>
        <button
          onClick={() => setHelpModal(null)}
          style={{ background: "none", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
      
      {helpModal === "how" && (
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <b>CORE CLASH</b>

          <br /><br />

          <b>Connect Wallet</b>

          <br /><br />

          <b>Create Game</b>
          <br />1. Add stake amount
          <br />2. Select your Clash Team
          <br />3. Press <b>Validate Team</b>
          <br />4. Press <b>Create Game</b>
          <br />5. Approve wallet transactions
          <br />6. Reveal file downloads automatically

          <br /><br />

          <b>Join Game</b>
          <br />1. Select your Clash Team
          <br />2. Press <b>Validate Team</b>
          <br />3. Find game in Open
          <br />4. Press Join Game
          <br />5. Approve wallet transactions
          <br />6. Reveal file downloads automatically

          <br /><br />

          <b>Reveal & Settle</b>
          <br />Auto-reveal will request wallet confirmation.
          <br />If it fails, upload your reveal file manually.
          <br />Once both players reveal, the game settles automatically.
        </div>
      )}

      {helpModal === "info" && (
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <b>Your Clash Team</b>

          <br /><br />

          • 3 NFTs from approved collections  
          • Only 1 rare background allowed (Gold, Verdant Green, Rose Gold, Silver)  
          • Only 1 of each character  
          • You must own the NFT  
          • You cannot join your own game  

          <br /><br />

          <b>The Clash</b>

          <br /><br />

          Slot 1 vs Slot 1  
          Slot 2 vs Slot 2  
          Slot 3 vs Slot 3  

          Each round results in a win or tie.  
          Score difference breaks ties.

          <br /><br />

          <b>Fees</b>

          <br /><br />

          5% of the pot  
          • 2% ETN_Villain  
          • 2% dApp host  
          • 1% CORE burn  

          <br /><br />

          <b>Payout</b>

          <br /><br />

          Winner receives 95% of the pot.  
          If tied, 100% returned to players.
        </div>
      )}
    </div>
  </div>
)}
</div>
</div>
</div>
</div>
  );
}