import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ethers } from "ethers";

import GameABI from "./abis/GameABI.json";
import ERC20ABI from "./abis/ERC20ABI.json";

import { GAME_ADDRESS } from "./config.js";

const BACKEND_URL = "http://localhost:3001";

export default function App() {
  /* ---------------- WALLET ---------------- */
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);

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
    const owner = await nft.ownerOf(tokenId);
    return owner.toLowerCase() === account.toLowerCase();
  }, [provider, account]);

  const debugGamesLength = async () => {
  if (!provider) return alert("Provider not ready");

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
            player1TokenIds: [...g.player1TokenIds],
            player2TokenIds: [...g.player2TokenIds],
            player1Backgrounds: [...g.player1Backgrounds],
            player2Backgrounds: [...g.player2Backgrounds],
            roundResults: [...g.roundResults],
          });

          i++;
        } catch {
          break;
        }
      }

      setGames(loaded);
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
    // ---------------- Approve ERC20 ----------------
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, signer);
    const stakeWei = ethers.parseUnits(stakeAmount, 18);
    const allowance = await erc20.allowance(account, GAME_ADDRESS);
    if (allowance < stakeWei) {
      const tx = await erc20.approve(GAME_ADDRESS, stakeWei);
      await tx.wait();
    }

    // ---------------- Prepare commit ----------------
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    // ---------------- On-chain create ----------------
    const tx = await gameContract.createGame(stakeToken, stakeWei, commit);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map(l => { 
        try { return gameContract.interface.parseLog(l); } 
        catch { return null; } 
      })
      .find(e => e?.name === "GameCreated");

    if (!event) throw new Error("GameCreated event not found");
    const gameId = Number(event.args.gameId);

    // ---------------- Download reveal backup ----------------
    const downloadRevealBackup = ({ gameId, player, salt, nftContracts, tokenIds }) => {
      const payload = { gameId, player, salt, nftContracts, tokenIds };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coreclash-reveal-game-${gameId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    downloadRevealBackup({
      gameId,
      player: account,
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert("Game created successfully! Reveal JSON downloaded.");

    // Refresh UI
    await loadGames();
  } catch (err) {
    console.error("Create game failed:", err);
    alert(err.reason || err.message || "Create game failed");
  }
}, [validated, signer, gameContract, stakeToken, stakeAmount, nfts, account, loadGames]);

/* ---------------- Join Game ---------------- */
const joinGame = async (gameId) => {
  if (!signer || !account || !gameContract) {
    alert("Wallet not connected");
    return;
  }

  try {
    // ---------------- Prepare on-chain commit ----------------
    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256", "address", "address", "address", "uint256", "uint256", "uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    // ---------------- On-chain join ----------------
    const tx = await gameContract.joinGame(gameId, commit);
    await tx.wait();

    // ---------------- Backend sync ----------------
    const joinPayload = {
      player2: account,
      salt: salt.toString(),
      nfts: nfts.map(n => ({
        address: n.address,
        tokenId: n.tokenId.toString()
      }))
    };

    const res = await fetch(`${BACKEND_URL}/games/${gameId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(joinPayload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Backend joinGame failed");

    console.log("Player 2 joined game on backend:", data);

    // ---------------- Download reveal backup ----------------
    const downloadRevealBackup = ({ gameId, player, salt, nftContracts, tokenIds }) => {
      const payload = { gameId, player, salt, nftContracts, tokenIds };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `coreclash-reveal-game-${gameId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    downloadRevealBackup({
      gameId,
      player: account,
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString()),
    });

    alert("Joined game successfully! Reveal JSON downloaded.");

    await loadGames(); // refresh UI
  } catch (err) {
    console.error("Join game failed:", err);
    alert(err.message || "Join failed");
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

  /* ---------------- HANDLE REVEAL FILE ---------------- */
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

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Backend reveal failed");
    }

    const { savedReveal } = await res.json();
    if (!savedReveal) {
      throw new Error("Backend did not return reveal data");
    }

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
      ids,
      backgrounds
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
    <p>Connected: {account || "Not connected"}</p>

    <button onClick={debugGamesLength}>
      Check on-chain games length
    </button>

    {/* ================= CREATE GAME ================= */}
    <h2>Create Game</h2>

    <label>Stake Token</label>
    <input
      value={stakeToken}
      onChange={e => setStakeToken(e.target.value)}
      style={{ width: "100%", marginBottom: 6 }}
    />

    <label>Stake Amount</label>
    <input
      value={stakeAmount}
      onChange={e => setStakeAmount(e.target.value)}
      style={{ width: "100%", marginBottom: 12 }}
    />

    <h3>NFT Team (3)</h3>
    {nfts.map((n, i) => (
      <div key={i} style={{ marginBottom: 10 }}>
        <input
          placeholder="NFT Address"
          value={n.address}
          onChange={e => updateNFT(i, "address", e.target.value.trim())}
        />
        <input
          placeholder="Token ID"
          value={n.tokenId}
          onChange={e => updateNFT(i, "tokenId", e.target.value.trim())}
        />

        {n.metadata && (
          <div style={{ marginTop: 5, fontSize: 14 }}>
            <b>{n.metadata.name}</b>
            <div>Background: {n.metadata.background}</div>
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

    {[...games].sort((a, b) => b.id - a.id).map((g) => {
      const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
      const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();

      return (
        <div
          key={g.id}
          style={{ border: "1px solid #444", padding: 14, marginBottom: 14 }}
        >
          <h3>Game #{g.id}</h3>

          <div>🟥 Player 1: {g.player1}</div>
          <div>🟦 Player 2: {g.player2 ?? "Waiting for opponent"}</div>

          <div style={{ marginTop: 6 }}>
            Stake: {ethers.formatUnits(g.stakeAmount || "0", 18)}
          </div>

          {/* Cancel button */}
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
                  await fetch(`${BACKEND_URL}/games/${g.id}/cancel`, {
                    method: "POST",
                  });
                  await loadGames();
                } catch (err) {
                  alert(err.message || "Cancel failed");
                }
              }}
            >
              Cancel Game
            </button>
          )}

          {/* Join button */}
          {g.player2 === ethers.ZeroAddress && !isPlayer1 && (
            <button onClick={() => joinGame(g.id)}>Join Game</button>
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

          {/* Settled result */}
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
                  : g.winner?.toLowerCase() === g.player1?.toLowerCase()
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