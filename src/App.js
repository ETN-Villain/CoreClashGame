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
  VKIN_CONTRACT_ADDRESS,
  VQLE_CONTRACT_ADDRESS,
  SCIONS_CONTRACT_ADDRESS,
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
  VerdantKinBanner, ElectroneumLogo, AetherScionsBanner, VerdantQueenBanner
} from "./appMedia/media.js";

import GameCard from "./gameCard.jsx";

import "./App.css";

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

const ELECTRONEUM_CHAIN_ID = 52014;
const ELECTRONEUM_CHAIN_HEX = "0xcb4e";

/* ---------------- WALLET STATE ---------------- */
const [provider, setProvider] = useState(null);
const [account, setAccount] = useState(null);
const [walletError, setWalletError] = useState(null);
const [wcProvider, setWcProvider] = useState(null);

const syncWalletState = useCallback(async (providerLike, wcInstance = null) => {
  try {
    const prov = new ethers.BrowserProvider(providerLike);
    const signer = await prov.getSigner();
    const addr = await signer.getAddress();

    setProvider(prov);
    setAccount(addr);
    setWcProvider(wcInstance);
    setWalletError(null);
  } catch (err) {
    console.warn("syncWalletState failed:", err);
  }
}, []);

/* ---------------- DEFAULT PROVIDER ---------------- */
useEffect(() => {
  if (!provider) {
    setProvider(new ethers.JsonRpcProvider(RPC_URL));
  }
}, [provider]);

/* ---------------- CONTRACTS (READ ONLY) ---------------- */
const erc20 = useMemo(() => {
  if (!provider || !stakeToken) return null;
  return new ethers.Contract(stakeToken, ERC20ABI, provider);
}, [provider, stakeToken]);

const coreContract = useMemo(() => {
  if (!provider) return null;
  return new ethers.Contract(CORE_TOKEN, ERC20ABI, provider);
}, [provider]);

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
  const [weeklyArchive, setWeeklyArchive] = useState({});

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

/* ---------------- ENSURE CORRECT NETWORK ---------------- */
const ensureCorrectNetwork = useCallback(
  async (provider, wcProviderInstance = null) => {
    try {
      // Determine chainId
if (!(provider instanceof ethers.BrowserProvider)) {
  throw new Error("Unsupported provider type");
}

const network = await provider.getNetwork();
const chainId = Number(network.chainId);

      if (chainId !== ELECTRONEUM_CHAIN_ID) {
        console.log(`Switching network from ${chainId} → ${ELECTRONEUM_CHAIN_ID}`);

    const hexChainId = "0x" + ELECTRONEUM_CHAIN_ID.toString(16);

        // MetaMask injected
        if (window.ethereum && !wcProviderInstance) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: hexChainId }],
            });
          } catch (switchErr) {
            if (switchErr.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: ELECTRONEUM_CHAIN_ID,
                    chainName: "Electroneum Mainnet",
                    nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
                    rpcUrls: ["https://rpc.ankr.com/electroneum"],
                    blockExplorerUrls: ["https://blockexplorer.electroneum.com"],
                  },
                ],
              });
            } else {
              throw switchErr;
            }
          }
        }

        // WalletConnect
        if (wcProviderInstance) {
          try {
            await wcProviderInstance.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: hexChainId }],
            });
          } catch (wcErr) {
            console.warn("WalletConnect chain switch failed:", wcErr);
            throw new Error("Switch your mobile wallet network to Electroneum");
          }
        }

// Re-check using ethers (safe for all providers)
const newNetwork = await provider.getNetwork();
const newChainId = Number(newNetwork.chainId);

if (newChainId !== ELECTRONEUM_CHAIN_ID) {
  throw new Error("Failed to switch to Electroneum network");
}
      }
    } catch (err) {
      console.warn("Network check failed:", err);
      throw new Error(err.message || "Please switch to Electroneum network");
    }
  },
  []
);

/* ---------------- DISCONNECT WALLET ---------------- */
const disconnectWallet = useCallback(async () => {
  setAccount(null);
  setProvider(null);
  setWalletError(null);

  if (wcProvider) {
    try {
      await wcProvider.disconnect();
    } catch {}
    setWcProvider(null);
  }

  localStorage.clear();
  sessionStorage.clear();
}, [wcProvider]);

/* ---------------- UNIFIED WALLET CONNECT ---------------- */
const connectWallet = useCallback(async (type = "metamask") => {
  setWalletError(null);

  try {
    let prov;
    let addr;
    let wcProvInstance = null;

    if (type === "metamask") {
      if (!window.ethereum) throw new Error("MetaMask not installed");

      await window.ethereum.request({ method: "eth_requestAccounts" });

      prov = new ethers.BrowserProvider(window.ethereum);
      await ensureCorrectNetwork(prov, null);

      const signer = await prov.getSigner();
      addr = await signer.getAddress();
    } else if (type === "walletconnect") {
      wcProvInstance = await EthereumProvider.init({
        projectId: "146ee334d324044083b6427d4bbf9202",
        chains: [52014],
        optionalChains: [52014],
        showQrModal: true,
        rpcMap: { 52014: "https://rpc.ankr.com/electroneum" },
      });

      wcProvInstance.on("connect", async () => {
        console.log("WalletConnect connected");
        await syncWalletState(wcProvInstance, wcProvInstance);
      });

      wcProvInstance.on("accountsChanged", async (accounts) => {
        console.log("WalletConnect accountsChanged:", accounts);
        if (accounts?.length > 0) {
          setAccount(accounts[0]);
          setProvider(new ethers.BrowserProvider(wcProvInstance));
          setWcProvider(wcProvInstance);
          setWalletError(null);
        }
      });

      wcProvInstance.on("disconnect", (err) => {
        console.log("WalletConnect disconnected:", err);
        setAccount(null);
        setWcProvider(null);
      });

      await wcProvInstance.enable();

      prov = new ethers.BrowserProvider(wcProvInstance);
      await ensureCorrectNetwork(prov, wcProvInstance);

      const signer = await prov.getSigner();
      addr = await signer.getAddress();
    }

    setProvider(prov);
    setAccount(addr);
    setWcProvider(wcProvInstance);
  } catch (err) {
    console.error("Wallet connection failed:", err);
    setWalletError(err.message || "Wallet connection failed");
  }
}, [ensureCorrectNetwork, syncWalletState]);

/* ---------------- RESTORE WALLET (FIXED) ---------------- */
useEffect(() => {
  let isMounted = true;

  const restoreWallet = async () => {
    if (!isMounted) return;

    try {
      /* ---------- 1️⃣ Injected (MetaMask) ---------- */
      if (window.ethereum) {
        try {
          const prov = new ethers.BrowserProvider(window.ethereum);

          const accounts = await prov.listAccounts();
          if (accounts.length > 0) {
            // 🔹 Validate provider properly
            await prov.getNetwork();

const signer = await prov.getSigner();

const addr = await signer.getAddress();
            if (!isMounted) return;

            setProvider(prov);
            setAccount(addr);
            setWcProvider(null);
            setWalletError(null);

            return;
          }
        } catch (err) {
          console.warn("Injected provider stale:", err);
        }
      }

      /* ---------- 2️⃣ WalletConnect ---------- */
      try {
const wc = await EthereumProvider.init({
  projectId: "146ee334d324044083b6427d4bbf9202",
  chains: [52014],
  optionalChains: [52014],
  showQrModal: true,
  rpcMap: { 52014: "https://rpc.ankr.com/electroneum" },
});

      if ((wc.connected || wc.session) && wc.session?.namespaces?.eip155) {
          try {
            await wc.enable();
          } catch (err) {
            console.warn("WC enable failed:", err);
            throw err;
          }

          const prov = new ethers.BrowserProvider(wc);

          // 🔹 Validate provider
          await prov.getNetwork();

const signer = await prov.getSigner();
const addr = await signer.getAddress();
          if (!isMounted) return;

          setProvider(prov);
          setAccount(addr);
          setWcProvider(wc);
          setWalletError(null);

          return;
        }
      } catch (err) {
        console.warn("WalletConnect restore failed:", err);
      }

    } catch (err) {
      console.warn("Wallet restore failed:", err);
    }

    /* ---------- 3️⃣ Fallback read-only ---------- */
    if (!isMounted) return;

    const readOnly = new ethers.JsonRpcProvider(RPC_URL);

    setProvider(readOnly);
    setAccount(null);
    setWcProvider(null);
    setWalletError(null);
  };

  restoreWallet();

  return () => { isMounted = false; };
}, []);

useEffect(() => {
  const handleReturnToApp = async () => {
    try {
      if (document.visibilityState === "hidden") return;

      // Try injected MetaMask first
      if (window.ethereum) {
        try {
          const injectedProv = new ethers.BrowserProvider(window.ethereum);
          const accounts = await injectedProv.send("eth_accounts", []);

          if (accounts.length > 0) {
            setProvider(injectedProv);
            setAccount(accounts[0]);
            setWalletError(null);
            return;
          }
        } catch (err) {
          console.warn("Injected return sync failed:", err);
        }
      }

      // Then try WalletConnect session
      if (wcProvider) {
        try {
          const prov = new ethers.BrowserProvider(wcProvider);
          const signer = await prov.getSigner();
          const addr = await signer.getAddress();

          setProvider(prov);
          setAccount(addr);
          setWcProvider(wcProvider);
          setWalletError(null);
        } catch (err) {
          console.warn("WalletConnect return sync failed:", err);
        }
      }
    } catch (err) {
      console.warn("Return-to-app sync failed:", err);
    }
  };

  window.addEventListener("focus", handleReturnToApp);
  document.addEventListener("visibilitychange", handleReturnToApp);

  return () => {
    window.removeEventListener("focus", handleReturnToApp);
    document.removeEventListener("visibilitychange", handleReturnToApp);
  };
}, [wcProvider]);

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
  if (!stakeToken || !stakeAmount) {
    alert("Missing stake token or amount");
    return;
  }

    // 🔹 Ensure signer is on Electroneum network
  await ensureCorrectNetwork(provider, wcProvider);

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
    // ✅ Use wallet-independent fallback RPC provider
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);

    // Connect contract for read-only
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI).connect(readProvider);

    // 1️⃣ Load on-chain games
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
      } catch {
        break;
      }
    }

    // 2️⃣ Fetch backend games
    const res = await fetch(`${BACKEND_URL}/games`);
    if (!res.ok) throw new Error("Backend fetch failed");
    const backendGames = await res.json();

    // 3️⃣ Merge on-chain + backend
const merged = backendGames.map((backendGame) => {
  const onChainGame = loadedOnChain.find(g => g.id === backendGame.id) || {};

  return {
    id: backendGame.id,
    player1: onChainGame.player1 || backendGame.player1 || ethers.ZeroAddress,
    player2: onChainGame.player2 || backendGame.player2 || ethers.ZeroAddress,
    stakeAmount: onChainGame.stakeAmount?.toString() || "0",
    stakeToken: backendGame.stakeToken || onChainGame.stakeToken,
    player1Revealed: !!backendGame.player1Revealed,
    player2Revealed: !!backendGame.player2Revealed,
    player1Reveal: backendGame.player1Reveal || null,
    player2Reveal: backendGame.player2Reveal || null,
    player2JoinedAt: backendGame.player2JoinedAt || null,
    createdAt: backendGame.createdAt || null,
    roundResults: backendGame.roundResults || [],
    winner: backendGame.winner || onChainGame.winner || ethers.ZeroAddress,
    tie: !!backendGame.tie,
    settled: backendGame.settled === true || onChainGame.settled === true,
    settledAt: backendGame.settledAt || null,
    settleTxHash: backendGame.settleTxHash || null,
    cancelled: backendGame.cancelled === true,
  };
});

    setGames(merged);
  } catch (err) {
    console.error("loadGames failed:", err);
  } finally {
    setLoadingGames(false);
  }
}, []); // ✅ no dependencies, ESLint clean

useEffect(() => {
  loadGames(); // initial load
  const interval = setInterval(loadGames, 30_000); // refresh every 30s
  return () => clearInterval(interval);
}, [loadGames]);

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

/// ---------------- CREATE GAME ---------------- */
const createGame = useCallback(async () => {
  if (!validated) {
    alert("Team not validated");
    return;
  }

  if (!provider || !account) {
    alert("Wallet not connected");
    return;
  }

  // 🔹 Ensure provider is on Electroneum network
  await ensureCorrectNetwork(provider, wcProvider);

  if (!stakeToken || !stakeAmount || nfts.some(n => !n.address || !n.tokenId)) {
    alert("All fields must be completed before creating a game");
    return;
  }

  try {
    // 🔹 Get a signer from the current provider
const signerSafe = await provider.getSigner();

    // 🔹 Contracts connected to signer for writing
    const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, signerSafe);
    const erc20Write = new ethers.Contract(stakeToken, ERC20ABI, signerSafe);

    // 🔹 Contracts connected to read-only provider for reading
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);
    const erc20Read = new ethers.Contract(stakeToken, ERC20ABI, readProvider);

    const stakeWei = ethers.parseUnits(stakeAmount.toString(), 18);

    // 1️⃣ Check allowance (read-only)
    let allowance;
    try {
      allowance = await erc20Read.allowance(account, GAME_ADDRESS);
    } catch (err) {
      console.error("Allowance check failed:", err);
      throw new Error("Could not read allowance. Check RPC or network.");
    }

    // 2️⃣ Approve if needed (write)
    if (allowance < stakeWei) {
      const approveTx = await erc20Write.approve(GAME_ADDRESS, stakeWei);
      await approveTx.wait();
    }

// 3️⃣ Prepare commit
const salt = ethers.toBigInt(ethers.randomBytes(32));
const nftContracts = nfts.map(n => n.address);
const tokenIds = nfts.map(n => BigInt(n.tokenId));

const commit = ethers.solidityPackedKeccak256(
  ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
  [salt, ...nftContracts, ...tokenIds]
);

// 4️⃣ Create game on-chain
const tx = await gameContract.createGame(stakeToken, stakeWei, commit);
const receipt = await tx.wait();

// 5️⃣ Extract gameId
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

// 6️⃣ Download reveal backup
downloadRevealBackup({
  gameId,
  player: account.toLowerCase(),
  salt: salt.toString(),
  nftContracts,
  tokenIds: tokenIds.map(t => t.toString()),
  backgrounds: nfts.map(n => n.metadata?.background || ""),
});

// 7️⃣ Save to backend
await fetch(`${BACKEND_URL}/games`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    gameId,
    creator: account,
    stakeToken,
    stakeAmount: stakeWei.toString(),
  }),
});

    alert(`Game #${gameId} created successfully!\nReveal file downloaded.`);
    await loadGames();
  } catch (err) {
    console.error("Create game failed:", err);
    alert(err.reason || err.message || "Create game failed");
  }
}, [
  validated,
  wcProvider,
  stakeToken,
  stakeAmount,
  nfts,
  account,
  loadGames,
  downloadRevealBackup,
  ensureCorrectNetwork,
  provider,
]);

/* ---------------- JOIN GAME ---------------- */
const joinGame = async (gameId) => {
  if (!provider || !account) {
    alert("Wallet not connected");
    return;
  }

  // 🔹 Ensure provider is on Electroneum network
  await ensureCorrectNetwork(provider, wcProvider);

  try {
    const numericGameId = Number(gameId);

    // 🔒 Derive live signer from provider
    const liveSigner = await provider.getSigner();
    const liveAccount = await liveSigner.getAddress();
    // Contract instance (write via signer)
    const contractRead = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
    const contractWrite = contractRead.connect(liveSigner);

    if (!liveAccount || liveAccount === ethers.ZeroAddress) {
      throw new Error("Invalid wallet address");
    }

    // 1️⃣ Fetch game details from backend
    const gameRes = await fetch(`${BACKEND_URL}/games/${numericGameId}`);
    if (!gameRes.ok) throw new Error("Failed to fetch game details");
    const gameData = await gameRes.json();

    const stakeToken = gameData.stakeToken;
    const stakeAmount = gameData.stakeAmount; // string/decimal

    if (!stakeToken || !stakeAmount) {
      throw new Error("Missing stake information from game");
    }

    console.log(`Joining game ${numericGameId} with stake: ${stakeAmount} of token ${stakeToken}`);

    // 2️⃣ Prepare commit
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

// 🔴 DOWNLOAD IMMEDIATELY (user gesture still active)
downloadRevealBackup({
  gameId: numericGameId,
  player: account.toLowerCase(),
  salt: salt.toString(),
  nftContracts,
  tokenIds: tokenIds.map(t => t.toString()),
  backgrounds: nfts.map(n => n.metadata?.background || ""),
});

    // 6️⃣ Save reveal backup
    const prefix = `${liveAccount.toLowerCase()}_${numericGameId}`;
    localStorage.setItem(`${prefix}_salt`, salt.toString());
    localStorage.setItem(`${prefix}_nftContracts`, JSON.stringify(nftContracts));
    localStorage.setItem(`${prefix}_tokenIds`, JSON.stringify(tokenIds.map(t => t.toString())));
    localStorage.setItem(`${prefix}_backgrounds`, JSON.stringify(nfts.map(n => n.metadata?.background || "")));

const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    // 3️⃣ Approve tokens using liveSigner
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, liveSigner);

    const stakeWei = ethers.parseUnits(stakeAmount, 18);
    const allowance = await erc20.allowance(liveAccount, GAME_ADDRESS);
    if (allowance < stakeWei) {
      console.log("Approving tokens...");
      const approveTx = await erc20.approve(GAME_ADDRESS, stakeWei);
      await approveTx.wait();
      alert("Tokens approved!");
    }

    // 4️⃣ Join on-chain
const tx = await contractWrite.joinGame(numericGameId, commit);
await tx.wait();

const gameOnChain = await contractRead.games(numericGameId);

    if (gameOnChain.player2.toLowerCase() !== liveAccount.toLowerCase()) {
      throw new Error("On-chain player mismatch");
    }

// 5️⃣ Update backend
const joinRes = await fetch(`${BACKEND_URL}/games/${numericGameId}/join`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ player2: gameOnChain.player2, player2JoinedAt: new Date().toISOString() }),
});

if (!joinRes.ok) {
  const errText = await joinRes.text();
  throw new Error(`Backend join failed: ${errText}`);
}

// Re-fetch fresh backend game state after join is persisted
const refreshedGameRes = await fetch(`${BACKEND_URL}/games/${numericGameId}`);
if (!refreshedGameRes.ok) {
  throw new Error("Failed to fetch refreshed game after join");
}
const refreshedGameData = await refreshedGameRes.json();

// ✅ Trigger auto-reveal with fresh backend state
await autoRevealIfPossible({
  ...refreshedGameData,
  id: numericGameId,
});

    alert(`Joined game #${numericGameId} successfully!`);

    await loadGames();
    setPendingAutoRevealGameId(numericGameId);

  } catch (err) {
    console.error("Join game failed:", err);
    alert(err.reason || err.message || "Join failed");
  }
};

/* -------- CANCEL UNJOINED GAME -----------*/
const cancelUnjoinedGame = async (gameId) => {
  if (!provider || !account) {
    alert("Wallet not connected");
    return;
  }

  // 🔹 Ensure provider is on Electroneum network
  await ensureCorrectNetwork(provider, wcProvider);

  try {
    // 🔒 Derive live signer
    const liveSigner = await provider.getSigner();

    // 1️⃣ Cancel on-chain
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI).connect(liveSigner);

    const tx = await contract.cancelUnjoinedGame(gameId);
    await tx.wait();

    await loadGames();
    alert(`Game #${gameId} cancelled successfully`);
  } catch (err) {
    console.error("Cancel failed:", err);
    alert(err.reason || err.message || "Cancel failed");
  }
};

/* ---------------- AUTO REVEAL (CHAIN AUTHORITATIVE) ---------------- */
const autoRevealIfPossible = useCallback(
  async (g) => {
    if (!account || !provider) return;

    await ensureCorrectNetwork(provider, wcProvider);

    try {
      const contractRead = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
      const signer = await provider.getSigner();
      const contractWrite = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

      const chainGame = await contractRead.games(BigInt(g.id));

      const accountLower = account.toLowerCase();
      const zeroLower = ethers.ZeroAddress.toLowerCase();

      const player1 = chainGame.player1.toLowerCase();
      const player2 = chainGame.player2.toLowerCase();

      const isP1 = player1 === accountLower;
      const isP2 = player2 === accountLower;

      if (!isP1 && !isP2) return;

      if (
        (isP1 && chainGame.player1Revealed) ||
        (isP2 && chainGame.player2Revealed)
      ) return;

      if (player2 === zeroLower) return;

      // 🔹 Load local data
      const prefix = `${accountLower}_${g.id}`;
      const saltStr = localStorage.getItem(`${prefix}_salt`);
      const nftContractsStr = localStorage.getItem(`${prefix}_nftContracts`);
      const tokenIdsStr = localStorage.getItem(`${prefix}_tokenIds`);

      if (!saltStr || !nftContractsStr || !tokenIdsStr) return;

      const salt = BigInt(saltStr);
      const nftContracts = JSON.parse(nftContractsStr);
      const tokenIds = JSON.parse(tokenIdsStr).map(BigInt);

      // ✅ 1️⃣ Chain FIRST
      const tx = await contractWrite.reveal(
        BigInt(g.id),
        salt,
        nftContracts,
        tokenIds
      );

      await tx.wait();

// ✅ 2️⃣ Backend AFTER success
const revealRes = await fetch(`${BACKEND_URL}/games/${g.id}/reveal`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-wallet": accountLower, // explicit auth (safe + clear)
  },
  body: JSON.stringify({
    player: accountLower,
    salt: salt.toString(),
    nftContracts,
    tokenIds: tokenIds.map((t) => t.toString()),
  }),
});

const revealJson = await revealRes.json().catch(() => ({}));

console.log("🔍 Reveal response:", revealRes.status, revealJson);

if (!revealRes.ok) {
  throw new Error(
    revealJson.error || `Reveal failed (${revealRes.status})`
  );
}

console.log("Auto-reveal completed", g.id, revealJson);

      await triggerBackendComputeIfNeeded(g.id);
      await loadGames();
    } catch (err) {
      console.error("Auto-reveal failed:", err);
    }
  },
  [wcProvider, account, provider, loadGames, triggerBackendComputeIfNeeded, ensureCorrectNetwork]
);

/* ---------------- REVEAL FILE UPLOAD ---------------- */
const handleRevealFile = useCallback(async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const { gameId, salt, nftContracts, tokenIds, backgrounds } = data;

    if (
      gameId === undefined ||
      !salt ||
      !Array.isArray(nftContracts) ||
      !Array.isArray(tokenIds) ||
      !Array.isArray(backgrounds)
    ) {
      throw new Error("Invalid reveal file");
    }

    if (!account || !provider) {
      throw new Error("Wallet not connected");
    }

    await ensureCorrectNetwork(provider, wcProvider);

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    // 1️⃣ On-chain reveal
    const tx = await contract.reveal(
      BigInt(gameId),
      BigInt(salt),
      nftContracts,
      tokenIds.map(id => BigInt(id)),
      backgrounds
    );
    await tx.wait();
    console.log("On-chain reveal succeeded for game", gameId);

    // 2️⃣ Backend reveal
    let backendData;
    try {
      const res = await fetch(`${BACKEND_URL}/games/${gameId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player: account.toLowerCase(),
          salt,
          nftContracts,
          tokenIds,
          backgrounds,
        }),
      });

      backendData = await res.json();

      if (!res.ok) throw new Error(backendData.error || "Backend reveal failed");

      console.log("Backend reveal succeeded for game", gameId);

    } catch (backendErr) {
      console.warn("Backend reveal failed, but on-chain succeeded:", backendErr);
      alert(
        "Reveal succeeded on-chain but failed to update backend. Please retry posting reveal."
      );
      return; // exit early, allow retry
    }

    // 3️⃣ Trigger compute and reload UI
    await triggerBackendComputeIfNeeded(gameId);
    await loadGames();

    alert("Reveal successful!");

  } catch (err) {
    console.error("Reveal failed:", err);
    alert(`Reveal failed: ${err.message}`);
  }
}, [account, provider, wcProvider, loadGames, ensureCorrectNetwork, triggerBackendComputeIfNeeded]);

/* ------ MANUAL SETTLE GAME -------- */
const manualSettleGame = useCallback(
  async (gameId) => {
    try {
      if (!account || !provider) {
        alert("Wallet not ready");
        return;
      }

      // 🔹 Ensure provider is on Electroneum network
      await ensureCorrectNetwork(provider, wcProvider);

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

      // Step 2: Post winner on-chain via live signer
      const liveSigner = await provider.getSigner();
      const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI).connect(liveSigner);

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
        throw new Error(
          "Awaiting on-chain postWinner and settleGame transaction. Reconcile also needs to run... please wait (~2mins). Hit refresh games"
        );
      }

      // Refresh local state
      await loadGames();

    } catch (err) {
      console.error("Manual settle failed:", err);
      alert(err.message || "Manual settle failed");
    }
  },
  [provider, wcProvider, account, loadGames, ensureCorrectNetwork]
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
  approveTokens,
  joinGame,
  manualSettleGame,
  handleRevealFile,
  cancelUnjoinedGame,
  renderTokenImages,
  downloadRevealBackup,
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

const isTrue = (v) => v === true || v === "true";

const hasRealPlayer2 = (g) =>
  !!g.player2 && g.player2 !== ethers.ZeroAddress;

const isPreJoinCancelled = (g) =>
  isTrue(g.cancelled) && !hasRealPlayer2(g);

const settledGames = games
  .filter((g) => isTrue(g.settled) && !isPreJoinCancelled(g))
  .sort((a, b) => b.id - a.id);

const cancelledGames = games
  .filter((g) => isTrue(g.cancelled))
  .sort((a, b) => b.id - a.id);

const sortedSettledGames = [...settledGames]
  .filter((g) => g.settledAt)
  .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
  
const latestSettled = sortedSettledGames.slice(0, 10);
const archivedSettled = sortedSettledGames.slice(10);

/* ---------------- LEADERBOARD ---------------- */
const [leaderboardMode, setLeaderboardMode] = useState("alltime"); // "alltime" | "weekly" | "characters"
const [showWeekly, setShowWeekly] = useState(false);
const [showWeeklyHistory, setShowWeeklyHistory] = useState(false);

const isAllTimeMode = leaderboardMode === "alltime";
const isWeeklyMode = leaderboardMode === "weekly";
const isCharacterMode = leaderboardMode === "characters";

const leaderboard = useMemo(() => {
  const stats = {};

  games
    .filter((g) => g.settled && !g.cancelled)
    .forEach((g) => {
      const p1 = g.player1?.toLowerCase();
      const p2 = g.player2?.toLowerCase();
      const winner = g.winner?.toLowerCase();
      const isTie = g.tie;

      [p1, p2].forEach((player) => {
        if (!player || player === ethers.ZeroAddress.toLowerCase()) return;

        if (!stats[player]) stats[player] = { wins: 0, played: 0 };
        stats[player].played += 1;
      });

      if (!isTie && winner && winner !== ethers.ZeroAddress.toLowerCase()) {
        if (!stats[winner]) stats[winner] = { wins: 0, played: 0 };
        stats[winner].wins += 1;
      }
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

const [characterNameMap, setCharacterNameMap] = useState({});

const resolveCollectionKeyFromAddress = (rawAddr) => {
  const addr = (rawAddr || "").toLowerCase();

  if (addr === VKIN_CONTRACT_ADDRESS.toLowerCase()) return "VKIN";
  if (addr === VQLE_CONTRACT_ADDRESS.toLowerCase()) return "VQLE";
  if (addr === SCIONS_CONTRACT_ADDRESS.toLowerCase()) return "SCIONS";
  return null;
};

useEffect(() => {
  const loadCharacterNames = async () => {
    try {
      const needed = new Map();

      games
        .filter((g) => g.settled && !g.cancelled)
        .forEach((g) => {
          [g.player1Reveal, g.player2Reveal].forEach((reveal) => {
            if (!reveal) return;

            const nftContracts = reveal.nftContracts || [];
            const tokenURIs = reveal.tokenURIs || [];

            tokenURIs.forEach((tokenURI, idx) => {
              const collectionKey = resolveCollectionKeyFromAddress(nftContracts[idx]);
              if (!collectionKey || !tokenURI) return;

              const key = `${collectionKey}:${tokenURI}`;
              if (!characterNameMap[key]) {
                needed.set(key, { collectionKey, tokenURI });
              }
            });
          });
        });

      if (needed.size === 0) return;

      const entries = await Promise.all(
        [...needed.values()].map(async ({ collectionKey, tokenURI }) => {
          try {
            const tokenIdGuess = tokenURI.replace(/\.json$/i, "");
            const res = await fetch(`${BACKEND_URL}/metadata/${collectionKey}/${tokenIdGuess}`);
            if (!res.ok) throw new Error("metadata fetch failed");
            const meta = await res.json();
            return [`${collectionKey}:${tokenURI}`, meta.name || tokenURI];
          } catch {
            return [`${collectionKey}:${tokenURI}`, tokenURI.replace(/\.json$/i, "")];
          }
        })
      );

      setCharacterNameMap((prev) => ({
        ...prev,
        ...Object.fromEntries(entries),
      }));
    } catch (err) {
      console.error("Failed to load character names:", err);
    }
  };

  loadCharacterNames();
}, [games, BACKEND_URL]); // eslint-disable-line react-hooks/exhaustive-deps

const characterLeaderboard = useMemo(() => {
  const stats = {};

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 28); // rolling 4 weeks
  start.setUTCHours(0, 0, 0, 0);

  const addPlayed = (entryKey, label) => {
    if (!stats[entryKey]) {
      stats[entryKey] = {
        label,
        wins: 0,
        played: 0,
        winRate: 0,
      };
    }
    stats[entryKey].played += 1;
  };

  const addWin = (entryKey, label) => {
    if (!stats[entryKey]) {
      stats[entryKey] = {
        label,
        wins: 0,
        played: 0,
        winRate: 0,
      };
    }
    stats[entryKey].wins += 1;
  };

  games
    .filter((g) => g.settled && !g.cancelled)
    .forEach((g) => {
      const resultDate = g.settledAt;
      if (!resultDate) return;

      const gameTime = new Date(resultDate);
      if (Number.isNaN(gameTime.getTime())) return;
      if (gameTime < start) return;

      const player1Reveal = g.player1Reveal;
      const player2Reveal = g.player2Reveal;
      const rounds = Array.isArray(g.roundResults) ? g.roundResults : [];

      if (!player1Reveal || !player2Reveal || rounds.length === 0) return;

const buildTeam = (reveal) => {
  const nftContracts = Array.isArray(reveal?.nftContracts) ? reveal.nftContracts : [];
  const tokenURIs = Array.isArray(reveal?.tokenURIs) ? reveal.tokenURIs : [];
  const backgrounds = Array.isArray(reveal?.backgrounds) ? reveal.backgrounds : [];

  return tokenURIs.map((tokenURI, idx) => {
    const collectionKey = resolveCollectionKeyFromAddress(nftContracts[idx]);
    const nameKey = `${collectionKey}:${tokenURI}`;

    const rawName =
      typeof characterNameMap[nameKey] === "string"
        ? characterNameMap[nameKey]
        : typeof tokenURI === "string"
        ? tokenURI.replace(/\.json$/i, "")
        : "Unknown";

    const baseName = String(rawName).replace(/\s*#\d+$/i, "").trim();
    const background = typeof backgrounds[idx] === "string" ? backgrounds[idx] : "Unknown";
    const label = `${baseName} ${background}`;
    const entryKey = `${baseName}||${background}`;

    return { entryKey, label };
  });
};

      const p1Team = buildTeam(player1Reveal);
      const p2Team = buildTeam(player2Reveal);

      // Each character played once if present in a settled game
      p1Team.forEach(({ entryKey, label }) => addPlayed(entryKey, label));
      p2Team.forEach(({ entryKey, label }) => addPlayed(entryKey, label));

      // Round winners map to slots 0/1/2
      rounds.forEach((round, idx) => {
        if (round.winner === "player1" && p1Team[idx]) {
          addWin(p1Team[idx].entryKey, p1Team[idx].label);
        } else if (round.winner === "player2" && p2Team[idx]) {
          addWin(p2Team[idx].entryKey, p2Team[idx].label);
        }
      });
    });

  return Object.values(stats)
    .map((entry) => ({
      ...entry,
      winRate: entry.played > 0 ? Math.round((entry.wins / entry.played) * 100) : 0,
    }))
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.played - a.played;
    });
}, [games, characterNameMap]);

/* ---------------- WEEKLY LEADERBOARD (LIVE FROM games) ---------------- */
const weeklyHistory = useMemo(() => {
  const stats = {};

  const now = new Date();

  // Monday-start UTC week
  const weekStart = new Date(now);
  const day = weekStart.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  weekStart.setUTCDate(weekStart.getUTCDate() + diffToMonday);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  games
    .filter((g) => g.settled && !g.cancelled)
    .forEach((g) => {
      const resultDate = g.settledAt || g.createdAt || g.date;
      if (!resultDate) return;

      const gameTime = new Date(resultDate);
      if (Number.isNaN(gameTime.getTime())) return;

      if (gameTime < weekStart || gameTime >= weekEnd) return;

      const p1 = g.player1?.toLowerCase();
      const p2 = g.player2?.toLowerCase();
      const winner = g.winner?.toLowerCase();
      const isTie = !!g.tie;

      [p1, p2].forEach((player) => {
        if (!player || player === ethers.ZeroAddress.toLowerCase()) return;

        if (!stats[player]) stats[player] = { wins: 0, played: 0 };
        stats[player].played += 1;
      });

      if (!isTie && winner && winner !== ethers.ZeroAddress.toLowerCase()) {
        if (!stats[winner]) stats[winner] = { wins: 0, played: 0 };
        stats[winner].wins += 1;
      }
    });

  const latest = Object.entries(stats)
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
    .slice(0, 3);

  return {
    latest,
    week: weekStart.toISOString().split("T")[0],
  };
}, [games]);

const weeklyLeaderboard = weeklyHistory.latest || [];

// Fetch weekly archive from backend on load
useEffect(() => {
  fetch(`${BACKEND_URL}/leaderboard/weekly`)
    .then(res => res.json())
    .then(setWeeklyArchive)
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

//SINGLE WALLET MODAL
const [showWalletModal, setShowWalletModal] = useState(false);

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
  style={{
    width: "90%",
    maxWidth: 500,
    animation: "logoPulse 2.4s ease-in-out infinite",
  }}
/>

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

const leaderboardRows = showWeekly ? weeklyLeaderboard : leaderboard;

const sortedWeeklyArchive = Object.entries(weeklyArchive || {})
  .filter(([_, players]) => Array.isArray(players) && players.length > 0)
  .sort((a, b) => new Date(b[0]) - new Date(a[0]));

const previousWeeklyArchive = sortedWeeklyArchive.slice(1, 7);

const renderLeaderboardCard = (mobile = false) => (
  <div
    style={{
      background: "#111",
      padding: mobile ? 16 : 24,
      borderRadius: 12,
      border: "1px solid #333",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr 1fr 1fr",
        fontSize: mobile ? 13 : 16,
        opacity: 0.7,
        borderBottom: "1px solid #333",
        paddingBottom: 6,
        marginBottom: 6,
      }}
    >
      <span>Player</span>
      <span style={{ textAlign: "center" }}>P</span>
      <span style={{ textAlign: "center" }}>W</span>
      <span style={{ textAlign: "center" }}>%</span>
    </div>

    {leaderboardRows.map((entry, index) => {
      const medalColor = ["#FFD700", "#C0C0C0", "#CD7F32"][index] || "#fff";
      const isCurrentUser = entry.address === account?.toLowerCase();

      return (
        <div
          key={`${entry.address}-${showWeekly ? "weekly" : "alltime"}`}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            padding: mobile ? "6px 0" : "8px 0",
            borderBottom: "1px solid #222",
            fontSize: mobile ? 14 : 16,
            color: isCurrentUser ? "#4da3ff" : medalColor,
            fontWeight: isCurrentUser ? "bold" : "normal",
          }}
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

    {leaderboardRows.length === 0 && (
      <div
        style={{
          opacity: 0.6,
          padding: mobile ? "10px 0" : "12px 0",
          textAlign: "center",
        }}
      >
        No games to display.
      </div>
    )}
  </div>
);

const renderWeeklyHistory = () =>
  showWeekly &&
  previousWeeklyArchive.length > 0 && (
    <div style={{ marginTop: 20 }}>
      <h3
        style={{
          color: "#aaa",
          fontSize: 16,
          marginBottom: 10,
        }}
      >
        Previous Weeks
      </h3>

      {previousWeeklyArchive.map(([week, players]) => (
        <div
          key={week}
          style={{
            background: "#0d0d0d",
            border: "1px solid #222",
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
            Week of {week}
          </div>

          {players.map((p, i) => (
            <div
              key={`${week}-${p.address}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                padding: "2px 0",
              }}
            >
              <span>
                #{i + 1} — {p.address.slice(0, 6)}…{p.address.slice(-4)}
              </span>
              <span>{p.wins}W / {p.played}P</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const renderCharacterLeaderboardCard = (mobile = false) => (
  <div
    style={{
      background: "#111",
      padding: mobile ? 16 : 24,
      borderRadius: 12,
      border: "1px solid #333",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: mobile ? "2.4fr 1fr 1fr 1fr" : "2.8fr 1fr 1fr 1fr",
        fontSize: mobile ? 13 : 16,
        opacity: 0.7,
        borderBottom: "1px solid #333",
        paddingBottom: 6,
        marginBottom: 6,
      }}
    >
      <span>Character</span>
      <span style={{ textAlign: "center" }}>P</span>
      <span style={{ textAlign: "center" }}>W</span>
      <span style={{ textAlign: "center" }}>%</span>
    </div>

    {characterLeaderboard.slice(0, 25).map((entry, index) => {
      const medalColor = ["#FFD700", "#C0C0C0", "#CD7F32"][index] || "#fff";

      return (
        <div
          key={entry.label}
          style={{
            display: "grid",
            gridTemplateColumns: mobile ? "2.4fr 1fr 1fr 1fr" : "2.8fr 1fr 1fr 1fr",
            padding: mobile ? "6px 0" : "8px 0",
            borderBottom: "1px solid #222",
            fontSize: mobile ? 14 : 16,
            color: medalColor,
          }}
        >
          <span>
            #{index + 1} — {entry.label}
          </span>
          <span style={{ textAlign: "center" }}>{entry.played}</span>
          <span style={{ textAlign: "center" }}>{entry.wins}</span>
          <span style={{ textAlign: "center" }}>{entry.winRate}%</span>
        </div>
      );
    })}

    {characterLeaderboard.length === 0 && (
      <div
        style={{
          opacity: 0.6,
          padding: mobile ? "10px 0" : "12px 0",
          textAlign: "center",
        }}
      >
        No character stats to display.
      </div>
    )}
  </div>
);

/* ----------- Ad Component ----------- */
const AdPlaceholder = () => (
  <div
    style={{
      position: "relative",
      width: "100%",
      padding: "18px 16px",
      borderRadius: 16,
      background: "linear-gradient(145deg, #0a0a0a, #141414)",
      border: "1px solid rgba(24,187,26,0.25)",
      boxShadow:
        "0 0 12px rgba(24,187,26,0.12), inset 0 0 20px rgba(0,0,0,0.6)",
      overflow: "hidden",
    }}
  >
    {/* Glow overlay */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 50% 0%, rgba(24,187,26,0.15), transparent 60%)",
        pointerEvents: "none",
      }}
    />

    {/* Sponsored tag */}
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 10,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 1.5,
        textTransform: "uppercase",
        color: "#18bb1a",
        opacity: 0.8,
      }}
    >
      Sponsored
    </div>

    {/* Content */}
    <div style={{ textAlign: "center", position: "relative" }}>
      <div
        style={{
          fontSize: isMobile ? 14 : 16,
          fontWeight: 700,
          color: "#fff",
          marginBottom: 6,
          letterSpacing: 0.5,
        }}
      >
        🚀 Promote Your Project
      </div>

      <div
        style={{
          fontSize: isMobile ? 12 : 13,
          color: "#aaa",
          marginBottom: 10,
        }}
      >
        Reach Core Clash players
      </div>

      <a
        href="https://t.me/ETN_Villain"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(24,187,26,0.12)",
          border: "1px solid rgba(24,187,26,0.5)",
          color: "#18bb1a",
          fontWeight: 700,
          fontSize: 13,
          textDecoration: "none",
          boxShadow: "0 0 8px rgba(24,187,26,0.3)",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 14px rgba(24,187,26,0.6)";
          e.currentTarget.style.background =
            "rgba(24,187,26,0.2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow =
            "0 0 8px rgba(24,187,26,0.3)";
          e.currentTarget.style.background =
            "rgba(24,187,26,0.12)";
        }}
      >
        Contact → t.me/ETN_Villain
      </a>
    </div>
  </div>
);

const renderGamesWithSingleAd = (games) => {
  // 🔥 If no games → show ad only
  if (!games || games.length === 0) {
    return (
      <div style={{ width: "100%" }}>
        <AdPlaceholder />
      </div>
    );
  }

  const items = [];

  games.forEach((g, index) => {
    items.push(
      <div key={`game-${g.id}`} style={{ width: "100%" }}>
        <GameCard g={g} {...gameCardProps} roundResults={g.roundResults || []} />
      </div>
    );

    // Insert ad after 2nd game
    if (index === 1) {
      items.push(
        <div key="single-ad-after-second" style={{ width: "100%" }}>
          <AdPlaceholder />
        </div>
      );
    }
  });

  // If fewer than 3 games → add ad at bottom
  if (games.length < 3) {
    items.push(
      <div key="single-ad-bottom" style={{ width: "100%" }}>
        <AdPlaceholder />
      </div>
    );
  }

  return items;
};

const renderGamesWithRepeatingAds = (games, keyPrefix = "settled") => {
  if (!games || games.length === 0) return null;

  const items = [];

  games.forEach((g, index) => {
    items.push(
      <div key={`${keyPrefix}-game-${g.id}`} style={{ width: "100%" }}>
        <GameCard g={g} {...gameCardProps} roundResults={g.roundResults || []} />
      </div>
    );

    // After every 2nd game: 2, 4, 6...
    if ((index + 1) % 2 === 0 && index !== games.length - 1) {
      items.push(
        <div key={`${keyPrefix}-ad-${index}`} style={{ width: "100%" }}>
          <AdPlaceholder />
        </div>
      );
    }
  });

  return items;
};

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
    animation: "logoPulse 2.4s ease-in-out infinite",
  }}
/>

{/* ---------------- WALLET BUTTONS ---------------- */}
<div
  style={{
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: "center",
    gap: isMobile ? 10 : 16,
  }}
>
  {!account ? (
    <>
      {/* Connect MetaMask */}
      <button
        onClick={() => connectWallet("metamask")}
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
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 20px rgba(24,187,26,0.9)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 10px rgba(24,187,26,0.6)")}
      >
        Connect MetaMask
      </button>

      {/* Connect WalletConnect */}
      <button
        onClick={() => connectWallet("walletconnect")}
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
        onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 20px rgba(26,117,255,0.9)")}
        onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 10px rgba(26,117,255,0.6)")}
      >
        Connect Mobile
      </button>
    </>
  ) : (
    // Wallet connected view
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

        <div style={{ width: 1, height: 16, background: "#333" }} />

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
</div>

{/* ---------------- ECOSYSTEM BLOCK ---------------- */}
<div
  style={{
    marginTop: 16,
    width: "100%",
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1.4fr 1.4fr 1.4fr 1fr",
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
      <img
        src={ElectroSwap}
        alt="Buy CORE"
        style={{ width: 34, height: 34, borderRadius: 6 }}
      />
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
      maxWidth: isMobile ? "100%" : 280,
      gridColumn: isMobile ? "1 / span 2" : undefined,
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

  {/* Verdant Queen Banner */}
  <a
    href="https://panth.art/collections/0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      textDecoration: "none",
      width: "100%",
      maxWidth: isMobile ? "100%" : 280,
      gridColumn: isMobile ? "1 / span 2" : undefined,
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
        src={VerdantQueenBanner}
        alt="Verdant Queen"
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
      />
    </div>
  </a>

  {/* Aether Scions Banner */}
  <a
    href="https://app.electroswap.io/nfts/collection/0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D"
    target="_blank"
    rel="noopener noreferrer"
    style={{
      textDecoration: "none",
      width: "100%",
      maxWidth: isMobile ? "100%" : 280,
      gridColumn: isMobile ? "1 / span 2" : undefined,
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
        src={AetherScionsBanner}
        alt="Aether Scions"
        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 8 }}
      />
    </div>
  </a>
</div>

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
  boxSizing: "border-box", // ✅ THIS FIXES IT PROPERLY
  marginBottom: 12,
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
    boxSizing: "border-box",
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
      Create Clash
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
    Build Your Team (Choose 1 from each row)
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
          const label = WHITELISTED_NFTS.find(
            (x) => x.address?.toLowerCase() === nftOption.nftAddress?.toLowerCase()
          )?.label;

const rawAddr = (nftOption.nftAddress || "")
  .toString()
  .trim()
  .toLowerCase();

let collectionKey;
if (rawAddr === VKIN_CONTRACT_ADDRESS.toLowerCase()) {
  collectionKey = "VKIN";
} else if (rawAddr === VQLE_CONTRACT_ADDRESS.toLowerCase()) {
  collectionKey = "VQLE";
} else if (rawAddr === SCIONS_CONTRACT_ADDRESS.toLowerCase()) {
  collectionKey = "SCIONS"; // mapping uses VKIN-style ids for Scions
} else {
  collectionKey = null;
}

const mapped =
  nftOption.tokenId && collectionKey
    ? mapping[collectionKey]?.[String(nftOption.tokenId)]
    : null;

const imageFile = mapped
  ? mapped.image_file ||
    mapped.token_uri?.replace(/\.json$/i, ".png") ||
    `${nftOption.tokenId}.png`
  : `${nftOption.tokenId}.png`;

const imageSrc =
  imageFile && collectionKey
    ? `${BACKEND_URL}/images/${collectionKey}/${imageFile}`
    : "/placeholder.png";

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
  <span>signer: {provider ? "✅" : "❌"}</span>
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
        !validated || !stakeToken || !stakeAmount || !provider
          ? "#555"
          : "linear-gradient(90deg, #ff7a00, #ff3d00)",
      color: "#fff",
      cursor:
        !validated || !stakeToken || !stakeAmount || !provider
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
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: isMobile ? "center" : "flex-start",
      gap: 12,
    }}
  >
    <img
      src={CoreClashLogo}
      alt="Core Clash"
      style={{
        width: isMobile ? 36 : 44,
        height: "auto",
        filter: "drop-shadow(0 0 6px #18bb1a)",
      }}
    />

    <h2
      style={{
        fontWeight: "bold",
        fontSize: isMobile ? 30 : 36,
        letterSpacing: 2,
        textTransform: "uppercase",
        color: "#18bb1a",
        margin: 0,
        animation: "coreNeonFlicker 2.2s infinite",
      }}
    >
      Core Clashes
    </h2>
    </div>
    
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
    display: "flex",
    flexDirection: "column",
    gap: 20,
  }}
>
  {showDeviceWarning && (
    <div
      style={{
        position: "fixed",
        top: 20,
        left: 20,
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
        >
          {[
            { key: "open", label: `Open (${openGames.length})` },
            { key: "active", label: `Active (${activeGames.length})` },
            { key: "settled", label: `Settled (${latestSettled.length})` },
            { key: "leaderboard", label: "Leaderboard" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 6px",
                borderRadius: 8,
                border: "1px solid #333",
                background: activeTab === tab.key ? "#18bb1a" : "#111",
                color: activeTab === tab.key ? "#000" : "#fff",
                fontWeight: "bold",
                cursor: "pointer",
                fontSize: 12,
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

     {/* ---------------- LEADERBOARD SECTION ---------------- */}
{!isMobile && (
  <div style={{ marginBottom: 30 }}>
<div
  style={{
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  }}
>
  <button
    type="button"
    onClick={() => {
      setLeaderboardMode("alltime");
      setShowWeekly(false);
      setShowWeeklyHistory(false);
    }}
    style={{
      padding: "9px 14px",
      borderRadius: 999,
      border: isAllTimeMode ? "1px solid #18bb1a" : "1px solid #333",
      background: isAllTimeMode ? "rgba(24,187,26,0.14)" : "#111",
      color: isAllTimeMode ? "#18bb1a" : "#ddd",
      fontSize: 15,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: isAllTimeMode ? "0 0 12px rgba(24,187,26,0.18)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {isAllTimeMode ? "✓ " : ""}All-Time
  </button>

  <button
    type="button"
    onClick={() => {
      setLeaderboardMode("weekly");
      setShowWeekly(true);
    }}
    style={{
      padding: "9px 14px",
      borderRadius: 999,
      border: isWeeklyMode ? "1px solid #18bb1a" : "1px solid #333",
      background: isWeeklyMode ? "rgba(24,187,26,0.14)" : "#111",
      color: isWeeklyMode ? "#18bb1a" : "#ddd",
      fontSize: 15,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: isWeeklyMode ? "0 0 12px rgba(24,187,26,0.18)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {isWeeklyMode ? "✓ " : ""}Weekly
  </button>

  <button
    type="button"
    onClick={() => {
      setLeaderboardMode("characters");
      setShowWeekly(false);
      setShowWeeklyHistory(false);
    }}
    style={{
      padding: "9px 14px",
      borderRadius: 999,
      border: isCharacterMode ? "1px solid #18bb1a" : "1px solid #333",
      background: isCharacterMode ? "rgba(24,187,26,0.14)" : "#111",
      color: isCharacterMode ? "#18bb1a" : "#ddd",
      fontSize: 15,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: isCharacterMode ? "0 0 12px rgba(24,187,26,0.18)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {isCharacterMode ? "✓ " : ""}Characters
  </button>

  {isWeeklyMode && (
    <button
      type="button"
      onClick={() => setShowWeeklyHistory((prev) => !prev)}
      style={{
        padding: "9px 14px",
        borderRadius: 999,
        border: showWeeklyHistory ? "1px solid #4da3ff" : "1px solid #333",
        background: showWeeklyHistory ? "rgba(77,163,255,0.14)" : "#111",
        color: showWeeklyHistory ? "#4da3ff" : "#aaa",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: showWeeklyHistory ? "0 0 12px rgba(77,163,255,0.16)" : "none",
        transition: "all 0.2s ease",
      }}
    >
      {showWeeklyHistory ? "✓ " : ""}Prev 6 Weeks
    </button>
  )}
</div>

<h2
  style={{
    color: "#18bb1a",
    fontWeight: "bold",
    fontSize: 30,
    textTransform: "uppercase",
    textShadow: "0 0 8px #18bb1a, 0 0 16px #18bb1a",
    marginBottom: 12,
  }}
>
  {isCharacterMode
    ? "🏆 Character Leaderboard (Rolling 4 Weeks)"
    : isWeeklyMode
    ? `🏆 Weekly Top 3 (${weeklyHistory.week})`
    : "🏆 All-Time Top 10"}
</h2>

{isCharacterMode
  ? renderCharacterLeaderboardCard(false)
  : renderLeaderboardCard(false)}

{isWeeklyMode && showWeeklyHistory && renderWeeklyHistory()}
  </div>
)}

{isMobile && activeTab === "leaderboard" && (
  <div style={{ marginTop: 20 }}>
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setLeaderboardMode("alltime");
          setShowWeekly(false);
          setShowWeeklyHistory(false);
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: isAllTimeMode ? "1px solid #18bb1a" : "1px solid #333",
          background: isAllTimeMode ? "rgba(24,187,26,0.14)" : "#111",
          color: isAllTimeMode ? "#18bb1a" : "#ddd",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: isAllTimeMode ? "0 0 10px rgba(24,187,26,0.18)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        {isAllTimeMode ? "✓ " : ""}All-Time
      </button>

      <button
        type="button"
        onClick={() => {
          setLeaderboardMode("weekly");
          setShowWeekly(true);
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: isWeeklyMode ? "1px solid #18bb1a" : "1px solid #333",
          background: isWeeklyMode ? "rgba(24,187,26,0.14)" : "#111",
          color: isWeeklyMode ? "#18bb1a" : "#ddd",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: isWeeklyMode ? "0 0 10px rgba(24,187,26,0.18)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        {isWeeklyMode ? "✓ " : ""}Weekly
      </button>

      <button
        type="button"
        onClick={() => {
          setLeaderboardMode("characters");
          setShowWeekly(false);
          setShowWeeklyHistory(false);
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: isCharacterMode ? "1px solid #18bb1a" : "1px solid #333",
          background: isCharacterMode ? "rgba(24,187,26,0.14)" : "#111",
          color: isCharacterMode ? "#18bb1a" : "#ddd",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: isCharacterMode ? "0 0 10px rgba(24,187,26,0.18)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        {isCharacterMode ? "✓ " : ""}Characters
      </button>

      {isWeeklyMode && (
        <button
          type="button"
          onClick={() => setShowWeeklyHistory((prev) => !prev)}
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: showWeeklyHistory ? "1px solid #4da3ff" : "1px solid #333",
            background: showWeeklyHistory ? "rgba(77,163,255,0.14)" : "#111",
            color: showWeeklyHistory ? "#4da3ff" : "#aaa",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: showWeeklyHistory ? "0 0 10px rgba(77,163,255,0.16)" : "none",
            transition: "all 0.2s ease",
          }}
        >
          {showWeeklyHistory ? "✓ " : ""}Prev 6 Weeks
        </button>
      )}
    </div>

    <h2
      style={{
        color: "#18bb1a",
        fontWeight: "bold",
        fontSize: 24,
        textTransform: "uppercase",
        textShadow: "0 0 8px #18bb1a, 0 0 16px #18bb1a",
        marginBottom: 12,
      }}
    >
      {isCharacterMode
        ? "🏆 Character Leaderboard (Rolling 4 Weeks)"
        : isWeeklyMode
        ? `🏆 Weekly Top 3 (${weeklyHistory.week})`
        : "🏆 All-Time Top 10"}
    </h2>

    {isCharacterMode
      ? renderCharacterLeaderboardCard(true)
      : renderLeaderboardCard(true)}

    {isWeeklyMode && showWeeklyHistory && renderWeeklyHistory()}
  </div>
)}

      {/* ---------------- GAMES GRID ---------------- */}
      {(!isMobile || activeTab !== "leaderboard") && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 20,
          }}
        >
          {/* OPEN */}
          {(!isMobile || activeTab === "open") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h3>🟢 Open Clashes ({openGames.length})</h3>
            {renderGamesWithSingleAd(openGames)}
            </div>
          )}

          {/* ACTIVE */}
          {(!isMobile || activeTab === "active") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h3>🟡 Active Clashes ({activeGames.length})</h3>
            {renderGamesWithSingleAd(activeGames)}
            </div>
          )}

          {/* SETTLED */}
          {(!isMobile || activeTab === "settled") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
<div
  style={{
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  }}
>
  {/* Settled */}
  <button
    type="button"
    onClick={() => setShowResolved((v) => !v)}
    style={{
      padding: "8px 12px",
      borderRadius: 999,
      border: showResolved ? "1px solid #18bb1a" : "1px solid #333",
      background: showResolved ? "rgba(24,187,26,0.14)" : "#111",
      color: showResolved ? "#18bb1a" : "#ddd",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: showResolved ? "0 0 10px rgba(24,187,26,0.18)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {showResolved ? "✓ " : ""}Settled
  </button>

  {/* Cancelled */}
  <button
    type="button"
    onClick={() => setShowCancelled((v) => !v)}
    style={{
      padding: "8px 12px",
      borderRadius: 999,
      border: showCancelled ? "1px solid #ff4d4d" : "1px solid #333",
      background: showCancelled ? "rgba(255,77,77,0.14)" : "#111",
      color: showCancelled ? "#ff4d4d" : "#ddd",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: showCancelled ? "0 0 10px rgba(255,77,77,0.18)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {showCancelled ? "✓ " : ""}Cancelled
  </button>

  {/* Archive */}
  <button
    type="button"
    onClick={() => setShowArchive((v) => !v)}
    style={{
      padding: "8px 12px",
      borderRadius: 999,
      border: showArchive ? "1px solid #4da3ff" : "1px solid #333",
      background: showArchive ? "rgba(77,163,255,0.14)" : "#111",
      color: showArchive ? "#4da3ff" : "#aaa",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: showArchive ? "0 0 10px rgba(77,163,255,0.16)" : "none",
      transition: "all 0.2s ease",
    }}
  >
    {showArchive ? "✓ " : ""}Archive
  </button>
</div>

              {showResolved && latestSettled.length > 0 && (
                <>
                  <h3>🔵 Settled Clashes ({latestSettled.length})</h3>
              {renderGamesWithRepeatingAds(
                [...latestSettled].sort(
                  (a, b) => new Date(b.settledAt).getTime() - new Date(a.settledAt).getTime()
                ),
                "settled"
                )}
                </>
              )}

              {showCancelled && cancelledGames.length > 0 && (
                <>
                  <h3>❌ Cancelled Clashes ({cancelledGames.length})</h3>
                  {cancelledGames.map((g) => (
                    <div key={g.id} style={{ width: "100%" }}>
                      <GameCard g={g} {...gameCardProps} roundResults={g.roundResults || []} />
                    </div>
                  ))}
                </>
              )}

              {showArchive && archivedSettled.length > 0 && (
                <>
                  <h3>📦 Archived Clashes ({archivedSettled.length})</h3>
                  {archivedSettled.map((g) => (
                    <div key={g.id} style={{ width: "100%" }}>
                      <GameCard g={g} {...gameCardProps} roundResults={g.roundResults || []} />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>

<div
  style={{
    marginTop: 50,
    padding: "20px 12px",
    textAlign: "center",
    borderTop: "1px solid #222",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }}
>
  {/* Copyright */}
  <div
    style={{
      fontSize: 13,
      color: "#888",
      letterSpacing: 1,
      textTransform: "uppercase",
      textShadow: "0 0 8px rgba(24,187,26,0.4)",
    }}
  >
    © {new Date().getFullYear()} Planet Zephyros × @ETN_Villain
  </div>

  {/* Divider line (subtle polish) */}
  <div
    style={{
      width: 60,
      height: 1,
      background: "linear-gradient(to right, transparent, #333, transparent)",
      margin: "4px auto",
    }}
  />

  {/* Disclaimer */}
  <div
    style={{
      fontSize: 11,
      color: "#555",
      maxWidth: 520,
      marginInline: "auto",
      lineHeight: 1.4,
    }}
  >
    Core Clash is a blockchain-based game. Use at your own risk. No financial advice.
    Users are responsible for their wallets, transactions, and smart contract interactions.
  </div>
</div>

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h2 style={{ color: "#18bb1a", margin: 0 }}>
            {helpModal === "how" ? "How To Play" : "Game Info"}
          </h2>
          <button
            onClick={() => setHelpModal(null)}
            style={{
              background: "none",
              border: "none",
              color: "#aaa",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {helpModal === "how" && (
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <b>CORE CLASH</b>
            <br />
            <br />
            <b>Connect Wallet</b>
            <br />
            <br />
            <b>Create Game</b>
            <br />
            1. Add stake amount
            <br />
            2. Select your Clash Team
            <br />
            3. Press <b>Validate Team</b>
            <br />
            4. Press <b>Create Game</b>
            <br />
            5. Approve wallet transactions
            <br />
            6. Reveal file downloads automatically
            <br />
            <br />
            <b>Join Game</b>
            <br />
            1. Select your Clash Team
            <br />
            2. Press <b>Validate Team</b>
            <br />
            3. Find game in Open
            <br />
            4. Press Join Game
            <br />
            5. Approve wallet transactions
            <br />
            6. Reveal file downloads automatically
            <br />
            <br />
            <b>Reveal & Settle</b>
            <br />
            Auto-reveal will request wallet confirmation.
            <br />
            If it fails, upload your reveal file manually.
            <br />
            Once both players reveal, the game settles automatically.
          </div>
        )}

        {helpModal === "info" && (
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <b>Your Clash Team</b>
            <br />
            <br />
            • 3 NFTs from approved collections
            <br />
            • Only 1 rare background allowed (Gold, Verdant Green, Rose Gold, Silver)
            <br />
            • Only 1 of each character
            <br />
            • You must own the NFT
            <br />
            • You cannot join your own game
            <br />
            • Pick 3 from the same faction for 10% attack boost
            <br />
            <br />
            <b>The Clash</b>
            <br />
            <br />
            Slot 1 vs Slot 1
            <br />
            Slot 2 vs Slot 2
            <br />
            Slot 3 vs Slot 3
            <br />
            <br />
            Each round results in a win or tie.
            <br />
            Score difference breaks ties.
            <br />
            <br />
            <b>Fees</b>
            <br />
            <br />
            5% of the pot
            <br />
            • 2% ETN_Villain
            <br />
            • 2% dApp host
            <br />
            • 1% CORE burn
            <br />
            <br />
            <b>Payout</b>
            <br />
            <br />
            Winner receives 95% of the pot.
            <br />
            If tied, 100% returned to players.
          </div>
        )}
      </div>
    </div>
  )}
</div>
</div>
</div>
);
}