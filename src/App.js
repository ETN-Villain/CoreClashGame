import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";

import GameABI from "./abis/GameABI.json";
import ERC20ABI from "./abis/ERC20ABI.json";

import { GAME_ADDRESS, WHITELISTED_TOKENS, WHITELISTED_NFTS } from "./config.js";

const BACKEND_URL = "http://localhost:3001";

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

export default function App() {
/* ---------------- WALLET ---------------- */
const [provider, setProvider] = useState(null);
const [signer, setSigner] = useState(null);
const [account, setAccount] = useState(null);
const [walletError, setWalletError] = useState(null);
const [ownedNFTs, setOwnedNFTs] = useState([]);

const connectWallet = useCallback(async () => {
  if (!window.ethereum) {
    alert("MetaMask not installed");
    return;
  }

  try {
    const prov = new ethers.BrowserProvider(window.ethereum);

    // 👇 User must approve connection
    await window.ethereum.request({ method: "eth_requestAccounts" });

    const signer = await prov.getSigner();
    const addr = await signer.getAddress();

    setProvider(prov);
    setSigner(signer);
    setAccount(addr);
    setWalletError(null);
  } catch (err) {
    console.error("MetaMask connect failed:", err);
    setWalletError(err.message || "MetaMask connection failed");
  }
}, []);

/* ---------------- RESTORE WALLET ---------------- */
useEffect(() => {
  if (!window.ethereum) return;

  const restoreWallet = async () => {
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_accounts" });
      if (accounts.length === 0) return;

      const signer = await prov.getSigner();
      setProvider(prov);
      setSigner(signer);
      setAccount(accounts[0]);
    } catch {
      // silent fail
    }
  };

  restoreWallet();

  // Listen for account changes (user switches wallet)
  window.ethereum.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      setAccount(null);
      setOwnedNFTs([]);
    } else {
      setAccount(accounts[0]);
    }
  });

  // Optional: listen for network changes
  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });

  // Cleanup listeners on unmount
  return () => {
    window.ethereum.removeAllListeners("accountsChanged");
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
        name: nft.name || `Token #${nft.tokenId}`,
        background: nft.background || "Unknown",
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
    { address: "", tokenId: "", metadata: null },
    { address: "", tokenId: "", metadata: null },
    { address: "", tokenId: "", metadata: null },
  ]);

  const [validated, setValidated] = useState(false);
  const [validating, setValidating] = useState(false);

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
    const copy = [...nfts];
    copy[idx][field] = value;
    if (field !== "metadata") copy[idx].metadata = null;
    setNfts(copy);
    setValidated(false);
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

function downloadRevealBackup({ gameId, player, salt, nftContracts, tokenIds }) {
  const payload = {
    gameId: Number(gameId),
    player,
    salt,
    nftContracts,
    tokenIds,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `coreclash-reveal-game-${payload.gameId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

  /* ---------------- LOAD GAMES ---------------- */
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

    const backendWinner = await contract.backendWinner(i);

    loaded.push({
      id: i,
      player1: g.player1,
      player2: g.player2,
      stakeAmount: g.stakeAmount,
      player1Revealed: g.player1Revealed,
      player2Revealed: g.player2Revealed,
      settled: g.settled,
      winner: g.winner,
      backendWinner,
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

    // 🔽 FETCH BACKEND GAMES (THIS IS THE KEY)
    const res = await fetch(`${BACKEND_URL}/games`);
    const backendGames = await res.json();

    const merged = loaded.map(g => {
      const backend = backendGames.find(bg => bg.id === g.id);
      return {
        ...g,
        _reveal: backend?._reveal || null,
      };
    });

    setGames(merged);
  } catch (err) {
    console.error("loadGames failed", err);
  } finally {
    setLoadingGames(false);
  }
}, [provider]);

  useEffect(() => {
    loadGames();
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

  /* ---------------- VALIDATE TEAM ---------------- */
  const validateTeam = useCallback(async () => {
    if (!nfts || nfts.length !== 3) {
      alert("You must select exactly 3 NFTs");
      return false;
    }

    setValidating(true);

    try {
      for (let i = 0; i < nfts.length; i++) {
        const nft = nfts[i];
        const addr = nft?.address?.trim();
        const tokenId = nft?.tokenId?.toString()?.trim();
        if (!addr || !tokenId) {
          alert(`Each NFT must have address and tokenId (problem at NFT #${i + 1})`);
          return false;
        }

        const owns = await userOwnsNFT(addr, tokenId);
        if (!owns) {
          alert(`You do NOT own NFT ${tokenId} at ${addr}`);
          return false;
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
    if (!createdEvent) {
      throw new Error("GameCreated event not found in transaction receipt");
    }

    const gameId = Number(createdEvent.args.gameId);
    if (!Number.isInteger(gameId)) {
      throw new Error("Invalid gameId extracted from event");
    }

    /* ---------- Download reveal backup ---------- */
    downloadRevealBackup({
      gameId,
      player: account.toLowerCase(),
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert(`Game #${gameId} created successfully!\nReveal file downloaded.`);

    /* ---------- Refresh UI ---------- */
    await loadGames();

  } catch (err) {
    console.error("Create game failed:", err);
    alert(err.reason || err.message || "Create game failed");
  }
}, [validated, signer, gameContract, stakeToken, stakeAmount, nfts, account, loadGames]);

/* ---------------- JOIN GAME ---------------- */
const joinGame = async (gameId) => {
  if (!signer || !account || !gameContract) {
    alert("Wallet not connected");
    return;
  }

  if (nfts.length !== 3 || nfts.some(n => !n.address || !n.tokenId)) {
    alert("You must select exactly 3 NFTs");
    return;
  }

  try {
    const numericGameId = Number(gameId);
    if (!Number.isInteger(numericGameId)) {
      throw new Error("Invalid gameId");
    }

    /* ---------- Prepare commit ---------- */
    const salt = ethers.toBigInt(ethers.randomBytes(32));

    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    /* ---------- Join on-chain ---------- */
    const tx = await gameContract.joinGame(numericGameId, commit);
    await tx.wait();

    /* ---------- Save reveal backup ---------- */
    downloadRevealBackup({
      gameId: numericGameId,
      player: account.toLowerCase(),
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert(`Joined game #${numericGameId} successfully!\nReveal file downloaded.`);

    await loadGames();

  } catch (err) {
    console.error("Join game failed:", err);
    alert(err.reason || err.message || "Join failed");
  }
};

/* ---------------- AUTO-REVEAL ---------------- */
  const revealAndMaybeSettle = useCallback(async (gameId) => {
    if (!signer || !account || !gameContract) return;

    try {
      const g = await gameContract.games(gameId);
      const isP1 = g.player1.toLowerCase() === account.toLowerCase();
      const isP2 = g.player2.toLowerCase() === account.toLowerCase();
      if (!isP1 && !isP2) return;

      if ((isP1 && g.player1Revealed) || (isP2 && g.player2Revealed)) return;
      if (isP1 && g.player2 === ethers.ZeroAddress) return;

      const saltStr = localStorage.getItem(isP1 ? "p1_salt" : `p2_salt_${gameId}`);
      const nftContractsStr = localStorage.getItem(isP1 ? "p1_nftContracts" : `p2_nftContracts_${gameId}`);
      const tokenIdsStr = localStorage.getItem(isP1 ? "p1_tokenIds" : `p2_tokenIds_${gameId}`);
      const backgroundsStr = localStorage.getItem(isP1 ? "p1_backgrounds" : `p2_backgrounds_${gameId}`);

      if (!saltStr || !nftContractsStr || !tokenIdsStr || !backgroundsStr) return;

      const salt = BigInt(saltStr);
      const nftContracts = JSON.parse(nftContractsStr);
      const tokenIds = JSON.parse(tokenIdsStr).map(t => BigInt(t));
      const backgrounds = JSON.parse(backgroundsStr);

      if (nftContracts.length !== 3 || tokenIds.length !== 3) return;

      const tx = await gameContract.reveal(salt, nftContracts, tokenIds, backgrounds);
      await tx.wait();

      const updatedGame = await gameContract.games(gameId);
      if (updatedGame.player1Revealed && updatedGame.player2Revealed && !updatedGame.settled) {
        const settleTx = await gameContract.settleGame(gameId);
        await settleTx.wait();
      }

      await loadGames();
    } catch (err) {
      console.error("Reveal / settle failed:", err);
    }
  }, [signer, account, gameContract, loadGames]);

async function handleRevealFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    const { gameId, salt, nftContracts, tokenIds } = data;

    if (!gameId || !salt || !Array.isArray(nftContracts) || !Array.isArray(tokenIds)) {
      throw new Error("Invalid reveal file");
    }

    if (!account || !signer) {
      throw new Error("Wallet not connected");
    }

// ------------------- POST reveal to backend FIRST -------------------
const res = await fetch(`${BACKEND_URL}/games/${gameId}/reveal`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    player: account.toLowerCase(),
    salt,
    nftContracts,
    tokenIds
  })
});

const backendData = await res.json();

if (!res.ok) {
  throw new Error(backendData.error || "Backend reveal failed");
}

const { savedReveal } = backendData;

    // ------------------- Extract NFT data -------------------
    const contracts = savedReveal.nftContracts;
    const ids = savedReveal.tokenIds.map(id => BigInt(id));

    // ------------------- Extract backgrounds (backend-authoritative) -------------------
    const backgrounds = savedReveal.backgrounds;
    if (!backgrounds || backgrounds.length !== 3) {
      throw new Error("Invalid backgrounds returned from backend");
    }

    // ------------------- Call contract -------------------
    const safeAddress = GAME_ADDRESS.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(safeAddress)) {
      throw new Error("GAME_ADDRESS is invalid");
    }

    const game = new ethers.Contract(safeAddress, GameABI, signer);

    const tx = await game.reveal(
      BigInt(gameId),
      BigInt(savedReveal.salt), // use backend-saved salt (canonical)
      contracts,
      ids
    );

    await tx.wait();

    alert("Reveal successful on-chain!");
    await loadGames(); // refresh frontend UI

  } catch (err) {
    console.error("Reveal failed:", err);
    alert(`Reveal failed: ${err.message}`);
  }
}

  /* ---------------- AUTO-REVEAL LOOP ---------------- */
  useEffect(() => {
    if (!account || games.length === 0) return;

    const interval = setInterval(() => {
      games.forEach(g => {
        const isParticipant = (g.player1?.toLowerCase() === account.toLowerCase() ||
                               g.player2?.toLowerCase() === account.toLowerCase());
        if (!isParticipant) return;

        if ((g.player1?.toLowerCase() === account.toLowerCase() && !g.player1Revealed) ||
            (g.player2?.toLowerCase() === account.toLowerCase() && !g.player2Revealed)) {
          revealAndMaybeSettle(g.id);
        }
      });
    }, 7000);

    return () => clearInterval(interval);
  }, [games, account, revealAndMaybeSettle]);

/* ---------------- UI ---------------- */
return (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <h1>Core Clash</h1>

    {!account ? (
      <button onClick={connectWallet}>Connect Wallet</button>
    ) : (
      <p>Connected: {account}</p>
    )}

    {walletError && (
      <div style={{ color: "red", marginBottom: 10 }}>
        Wallet error: {walletError}
      </div>
    )}

    {/* ================= CREATE GAME ================= */}
    <h2>Create Game</h2>

<label>Stake Token</label>
<select
  value={stakeToken}
  onChange={(e) => setStakeToken(e.target.value)}
  style={{ width: "100%", marginBottom: 6 }}
>
  {WHITELISTED_TOKENS.map((t) => (
    <option key={t.address} value={t.address}>
      {t.label}
    </option>
  ))}
</select>

<label>Stake Amount</label>
<input
  value={stakeAmount}
  onChange={(e) => setStakeAmount(e.target.value)}
  style={{ width: "100%", marginBottom: 12 }}
/>

<h3>NFT Team (3)</h3>
{nfts.map((n, i) => (
  <div key={i} style={{ marginBottom: 12 }}>
    {/* NFT Collection Dropdown */}
    <select
      value={n.address}
      onChange={(e) => updateNFT(i, "address", e.target.value)}
      style={{ width: "40%", marginRight: 8 }}
    >
      <option value="">Select NFT</option>
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
        const selected = ownedNFTs.find((nft) => nft.tokenId === tokenId);

        setNfts((prev) =>
          prev.map((slot, idx) =>
            idx === i
              ? {
                  ...slot,
                  tokenId,
                  metadata: selected || null,
                  address: selected?.nftAddress || slot.address
                }
              : slot
          )
        );
      }}
      style={{ width: "55%", marginLeft: 8 }}
    >
      <option value="">Select your NFT</option>
      {ownedNFTs
        // Filter out NFTs already selected in other slots
        .filter((nft) => !nfts.some((s, idx) => idx !== i && s.tokenId === nft.tokenId))
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
        {/* NFT Image */}
        <img
          src={`${BACKEND_URL}/images/${n.metadata.tokenURI
            ?.replace("metadata/", "")
            ?.replace(".json", "")}.png`}
          alt={n.metadata.name}
          style={{
            width: 72,
            height: 72,
            objectFit: "cover",
            borderRadius: 6,
            border: "1px solid #444",
          }}
        />

        {/* Metadata */}
        <div style={{ fontSize: 14 }}>
          <div style={{ fontWeight: "bold" }}>{n.metadata.name}</div>
          <div style={{ opacity: 0.85 }}>
            Background: {n.metadata.background}
          </div>
        </div>
      </div>
    )}
  </div>
))}

<button disabled={validating} onClick={validateTeam}>
  {validating ? "Validating..." : "Validate Team"}
</button>

<div style={{ marginTop: 12 }}>
  <button
    onClick={approveTokens}
    disabled={!stakeToken || !stakeAmount || !signer}
  >
    Approve Tokens
  </button>

  <button
    onClick={createGame}
    disabled={!validated || !stakeToken || !stakeAmount || !signer}
    style={{ marginLeft: 8 }}
  >
    Create Game
  </button>
</div>

    {/* ================= GAMES ================= */}
    <h2 style={{ marginTop: 40 }}>Games</h2>

    {loadingGames && <p>Loading games…</p>}
    {!loadingGames && games.length === 0 && <p>No games yet</p>}

    {[...games]
      .sort((a, b) => b.id - a.id)
      .map((g) => {
        const isPlayer1 =
          g.player1?.toLowerCase() === account?.toLowerCase();
        const isPlayer2 =
          g.player2?.toLowerCase() === account?.toLowerCase();

        const bothRevealed =
          g.player1Revealed === true &&
          g.player2Revealed === true;

        const canSettle =
          bothRevealed && !g.settled && (isPlayer1 || isPlayer2);

        return (
          <div
            key={g.id}
            style={{
              border: "1px solid #444",
              padding: 14,
              marginBottom: 14,
            }}
          >
            <h3>Game #{g.id}</h3>

            <div>🟥 Player 1: {g.player1}</div>
            {g._reveal?.player1 && renderTeamImages(g._reveal.player1)}

            <div style={{ marginTop: 8 }}>
              🟦 Player 2: {g.player2 ?? "Waiting for opponent"}
            </div>
            {g._reveal?.player2 && renderTeamImages(g._reveal.player2)}

            <div style={{ marginTop: 8 }}>
              Stake: {ethers.formatUnits(g.stakeAmount || "0", 18)}
            </div>

            {/* Cancel */}
            {g.player2 === ethers.ZeroAddress && isPlayer1 && (
              <button
                onClick={async () => {
                  try {
                    const gameContract = new ethers.Contract(
                      GAME_ADDRESS,
                      GameABI,
                      signer
                    );
                    const tx = await gameContract.cancelGame(g.id);
                    await tx.wait();
                    await fetch(
                      `${BACKEND_URL}/games/${g.id}/cancel`,
                      { method: "POST" }
                    );
                    await loadGames();
                  } catch (err) {
                    alert(err.message || "Cancel failed");
                  }
                }}
              >
                Cancel Game
              </button>
            )}

            {/* Join */}
            {g.player2 === ethers.ZeroAddress && !isPlayer1 && (
              <button onClick={() => joinGame(g.id)}>
                Join Game
              </button>
            )}

            {/* Reveal upload */}
            {((isPlayer1 && !g.player1Revealed) ||
              (isPlayer2 && !g.player2Revealed)) && (
              <label style={{ marginLeft: 8, cursor: "pointer" }}>
                Upload Reveal
                <input
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={handleRevealFile}
                />
              </label>
            )}

            {/* Settle */}
            {canSettle && (
              <button
                style={{
                  marginLeft: 8,
                  background: "#8b5cf6",
                  color: "white",
                }}
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `${BACKEND_URL}/games/${g.id}/post-winner`,
                      { method: "POST" }
                    );
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);

                    const gameContract = new ethers.Contract(
                      GAME_ADDRESS,
                      GameABI,
                      signer
                    );
                    const tx = await gameContract.settleGame(g.id);
                    await tx.wait();

                    await loadGames();
                  } catch (err) {
                    alert(err.message || "Settle failed");
                  }
                }}
              >
                Settle Game
              </button>
            )}

            {/* Result */}
            {g.settled && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: "#111",
                  border: "1px solid #333",
                }}
              >
                <h3>
                  🏆 Result:{" "}
                  {g.winner === ethers.ZeroAddress
                    ? "Draw"
                    : g.winner?.toLowerCase() ===
                      g.player1?.toLowerCase()
                    ? "Player 1 wins"
                    : "Player 2 wins"}
                </h3>
                <div style={{ fontSize: 14, marginTop: 6 }}>
                  Winner address: {g.winner ?? "—"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}