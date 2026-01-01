import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import GameABI from "./abis/GameABI.json";
import ERC20ABI from "./abis/ERC20ABI.json";

import { GAME_ADDRESS } from "./config.js";

const BACKEND_URL = "http://localhost:3001";

export default function App() {
  /* ---------------- WALLET ---------------- */
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);

  const [stakeToken, setStakeToken] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [nfts, setNfts] = useState([
    { address: "", tokenId: "", metadata: null },
    { address: "", tokenId: "", metadata: null },
    { address: "", tokenId: "", metadata: null }
  ]);

const [validated, setValidated] = useState(false);
const [validating, setValidating] = useState(false);


  useEffect(() => {
    if (!window.ethereum) return;

    const init = async () => {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const signer = await prov.getSigner();
      setProvider(prov);
      const addr = await signer.getAddress();
      setSigner(signer);
      setAccount(addr);
    };

    init();
  }, []);

  /* ---------------- GAMES ---------------- */
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

  async function userOwnsNFT(nftAddress, tokenId) {
    if (!provider || !account) return false;
    try {
      const nftContracts = new ethers.Contract(
        nftAddress,
        ["function ownerOf(uint256 tokenId) view returns (address)"],
        provider
      );
      const owner = await nftContracts.ownerOf(tokenId);
      return owner.toLowerCase() === account.toLowerCase();
    } catch (err) {
      console.error("Ownership check failed:", err);
      return false;
    }
  }

  function downloadRevealBackup(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coreclash-reveal-game-${data.gameId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- LOAD GAMES ---------------- */
  const loadGames = useCallback(async () => {
    if (!provider) return;

    setLoadingGames(true);
    try {
      const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, provider);
      const loaded = [];
      let i = 0;
      while (true) {
        try {
          const g = await gameContract.games(i);
          if (g.player1 === ethers.ZeroAddress) break;

          loaded.push({
            id: i,
            player1: g.player1 || ethers.ZeroAddress,
            player2: g.player2 || ethers.ZeroAddress,
            stakeAmount: g.stakeAmount,
            player1Revealed: g.player1Revealed,
            player2Revealed: g.player2Revealed,
            settled: g.settled,
            winner: g.winner || ethers.ZeroAddress,
            player1TokenIds: g.player1TokenIds ? [...g.player1TokenIds] : [],
            player2TokenIds: g.player2TokenIds ? [...g.player2TokenIds] : [],
//            player1Backgrounds: g.player1Backgrounds ? [...g.player1Backgrounds] : [],
//            player2Backgrounds: g.player2Backgrounds ? [...g.player2Backgrounds] : []
          });
          i++;
        } catch {
          break;
        }
      }
      setGames(loaded);
    } catch (e) {
      console.error("loadGames failed", e);
    } finally {
      setLoadingGames(false);
    }
  }, [provider]);

  /* ---------------- REVEAL & SETTLE ---------------- */
  const revealAndMaybeSettle = useCallback(async (gameId) => {
    if (!signer || !account) return;

    try {
      const gameContract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);
      const g = await gameContract.games(gameId);

      const isP1 = g.player1.toLowerCase() === account.toLowerCase();
      const isP2 = g.player2.toLowerCase() === account.toLowerCase();

      if ((isP1 && g.player1Revealed) || (isP2 && g.player2Revealed)) return;
      if (isP1 && g.player2 === ethers.ZeroAddress) return;

      const res = await fetch(`${BACKEND_URL}/reveal-backup/${gameId}/${account}`);
      if (!res.ok) {
        console.warn("No reveal backup found for this game/account, skipping");
        return;
      }
      const data = await res.json();
      const salt = BigInt(data.salt);
      const nftContracts = data.nftContracts;
      const tokenIds = data.tokenIds.map(t => BigInt(t));

      if (nftContracts.length !== 3 || tokenIds.length !== 3) {
        console.warn("Reveal backup malformed — skipping", data);
        return;
      }

      const tx = await gameContract.reveal(gameId, salt, nftContracts, tokenIds);
      await tx.wait();
      console.log(`Reveal completed for game ${gameId}`);

      const updatedGame = await gameContract.games(gameId);
      if (updatedGame.player1Revealed && updatedGame.player2Revealed && !updatedGame.settled) {
        const settleTx = await gameContract.settleGame(gameId);
        await settleTx.wait();
        console.log(`Game ${gameId} auto-settled`);
      }

      await loadGames();
    } catch (err) {
      console.error("Reveal / settle failed:", err);
    }
  }, [signer, account, loadGames]);

  /* ---------------- AUTO-REVEAL LOOP ---------------- */
  useEffect(() => {
    if (!account || games.length === 0) return;

    const interval = setInterval(() => {
      games.forEach(g => {
        const isParticipant = g.player1.toLowerCase() === account.toLowerCase() || g.player2.toLowerCase() === account.toLowerCase();
        if (!isParticipant) return;

        if ((g.player1.toLowerCase() === account.toLowerCase() && !g.player1Revealed) ||
            (g.player2.toLowerCase() === account.toLowerCase() && !g.player2Revealed)) {
          revealAndMaybeSettle(g.id);
        }
      });
    }, 7000);

    return () => clearInterval(interval);
  }, [games, account, revealAndMaybeSettle]);

/* ---------------- METADATA VALIDATION ---------------- */
async function validateNFTOwnership() {
  for (const nft of nfts) {
    if (!nft.address || nft.tokenId === "") {
      throw new Error("Missing NFT address or tokenId");
    }
    const owns = await userOwnsNFT(nft.address, nft.tokenId);
    if (!owns) {
      throw new Error(`You do not own NFT ${nft.tokenId}`);
    }
  }
  return true;
}

async function fetchMetadataAndValidate() {
  try {
    setValidating(true);

    await validateNFTOwnership();

const res = await fetch(`${BACKEND_URL}/games/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nfts: nfts.map(n => ({
          address: n.address,
          tokenId: n.tokenId
        }))
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    setNfts(prev =>
      prev.map((n, i) => ({ ...n, metadata: data.metadata[i] }))
    );

    localStorage.setItem("p1_backgrounds",
      JSON.stringify(data.metadata.map(m => m.background))
    );

    localStorage.setItem("p1_traits",
      JSON.stringify(data.metadata.map(m => m.traits))
    );

    setValidated(true);
    alert("Team validated");
  } catch (err) {
    setValidated(false);
    alert(err.message);
  } finally {
    setValidating(false);
  }
}

  /* ---------------- REVEAL FILE ---------------- */
async function handleRevealFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Basic validation
    if (!data || !data.gameId || !data.salt || !data.nftContracts || !data.tokenIds) {
      throw new Error("Invalid reveal data");
    }

    const game = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    // Convert tokenIds & salt to BigInt
    const tx = await game.reveal(
      data.gameId,
      BigInt(data.salt),
      data.nftContracts,
      data.tokenIds.map(t => BigInt(t))
    );

    await tx.wait();
    alert("Reveal successful");

    // Reload games after reveal
    await loadGames();
  } catch (err) {
    console.error(err);
    alert(`Reveal failed: ${err.message}`);
  }
}

  /* ---------------- USE EFFECT ---------------- */
  useEffect(() => {
    if (!provider) return;
    loadGames();
  }, [provider, loadGames]);

// ---------------- CREATE GAME ----------------
async function createGame() {
  if (!validated || !signer) return;

  // ✅ Check ownership before creating
  const ownsNFTs = await validateNFTOwnership();
  if (!ownsNFTs) return;

  try {
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, signer);
    const game = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    const stakeWei = ethers.parseUnits(stakeAmount, 18);
    const allowance = await erc20.allowance(account, GAME_ADDRESS);

    if (allowance < stakeWei) {
      await (await erc20.approve(GAME_ADDRESS, stakeWei)).wait();
    }

    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const tokenIds = nfts.map(n => BigInt(n.tokenId));
    const nftContracts = nfts.map(n => n.address);

    const commit = ethers.solidityPackedKeccak256(
      ["uint256","address","address","address","uint256","uint256","uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

const event = receipt.logs
  .map(l => {
    try { return game.interface.parseLog(l); } catch { return null; }
  })
  .find(e => e?.name === "GameCreated");

    localStorage.setItem("p1_salt", salt.toString());
    localStorage.setItem("p1_tokenIds", JSON.stringify(tokenIds.map(t => t.toString())));
    localStorage.setItem("p1_nftContracts", JSON.stringify(nftContracts));

    const event = receipt.logs
      .map(l => {
        try { return game.interface.parseLog(l); } catch { return null; }
      })
      .find(e => e?.name === "GameCreated");

    if (!event) throw new Error("GameCreated not found");

    const gameId = Number(event.args.gameId);

    downloadRevealBackup({
      gameId,
      player: account,
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(String)
    });

    await loadGames();
    alert("Game created successfully!");
  } catch (err) {
    console.error(err);
    alert(err.message || "Create game failed");
  }
}

// ---------------- JOIN GAME ----------------
async function joinGame(gameId) {
  if (!validated || !signer) {
    alert("Validate your team before joining");
    return;
  }

  const ownsNFTs = await validateNFTOwnership();
  if (!ownsNFTs) return;

  try {
    const plainNFTs = nfts.map(n => ({ address: n.address, tokenId: n.tokenId }));

    // Backend validation
    const res = await fetch(`${BACKEND_URL}/games/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, player: account, nfts: plainNFTs })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Backend validation failed");

    const traits = [];
    const backgrounds = [];
    data.metadata.forEach((m, i) => {
      traits.push(m.traits.map(Number));
      backgrounds.push(m.background || "Unknown");
    });

    const game = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

    // ---------------- ADD ALLOWANCE CHECK ----------------
    const stakeWei = ethers.parseUnits(games.find(g => g.id === gameId).stakeAmount.toString(), 18);
    const erc20 = new ethers.Contract(stakeToken, ERC20ABI, signer);
    const allowance = await erc20.allowance(account, GAME_ADDRESS);
    if (allowance < stakeWei) {
      await (await erc20.approve(GAME_ADDRESS, stakeWei)).wait();
    }
    // ------------------------------------------------------

    const salt = ethers.toBigInt(ethers.randomBytes(32));
    const nftContracts = nfts.map(n => n.address);
    const tokenIds = nfts.map(n => BigInt(n.tokenId));

    const commit = ethers.solidityPackedKeccak256(
      ["uint256","address","address","address","uint256","uint256","uint256"],
      [salt, ...nftContracts, ...tokenIds]
    );

    const tx = await game.joinGame(gameId, commit);
    await tx.wait();

    const _player2 = {
      teamData: nfts.map((n, i) => ({
        address: n.address,
        tokenId: n.tokenId,
        background: backgrounds[i],
        traits: [...traits[i]]
      })),
      revealed: false
    };

    const revealBackup = {
      gameId,
      player: account,
      salt: salt.toString(),
      nftContracts,
      tokenIds: tokenIds.map(t => t.toString())
    };
    downloadRevealBackup(revealBackup);

    setGames(prevGames =>
      prevGames.map(g => g.id === gameId
        ? { ...g, player2: account, player2JoinedAt: new Date().toISOString(), _player2 }
        : g
      )
    );

    await loadGames();
    alert("Joined game successfully!");
  } catch (err) {
    console.error(err);
    alert(err.message || "Join failed");
  }
}

return (
  <div style={{ padding: 20, maxWidth: 900 }}>
    <h1>Core Clash</h1>
    <p>Connected: {account || "Not connected"}</p>

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
          onChange={e => updateNFT(i, "address", e.target.value)}
        />
        <input
          placeholder="Token ID"
          value={n.tokenId}
          onChange={e => updateNFT(i, "tokenId", e.target.value)}
        />
        {n.metadata && (
          <div style={{ marginTop: 5, fontSize: 14 }}>
            <b>{n.metadata.name}</b>
            <div>Background: {n.metadata.background}</div>
          </div>
        )}
      </div>
    ))}

    {/* ================= VALIDATE & CREATE ================= */}
    <button disabled={validating} onClick={fetchMetadataAndValidate}>
      {validating ? "Validating..." : "Validate Team"}
    </button>

    <div style={{ marginTop: 12 }}>
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
      .map((g) => (
        <div
          key={g.id}
          style={{ border: "1px solid #444", padding: 14, marginBottom: 14 }}
        >
          <h3>Game #{g.id}</h3>

          {/* Players */}
          <div>🟥 Player 1: {g.player1}</div>
          <div>
            🟦 Player 2:{" "}
            {g.player2 !== ethers.ZeroAddress ? g.player2 : "Waiting for opponent"}
          </div>
          <div style={{ marginTop: 6 }}>
            Stake: {ethers.formatUnits(g.stakeAmount, 18)}
          </div>

          {/* Actions */}
          <div style={{ marginTop: 10 }}>
            {g.player2 === ethers.ZeroAddress &&
              g.player1.toLowerCase() !== account?.toLowerCase() && (
                <button onClick={() => joinGame(g.id)}>Join Game</button>
              )}

            {((g.player1.toLowerCase() === account?.toLowerCase() &&
              g.player2 !== ethers.ZeroAddress &&
              !g.player1Revealed) ||
              (g.player2.toLowerCase() === account?.toLowerCase() &&
                !g.player2Revealed)) && (
              <button
                onClick={() => revealAndMaybeSettle(g.id)}
                style={{ marginLeft: 8 }}
              >
                Reveal
              </button>
            )}

            {g.player1Revealed &&
              g.player2Revealed &&
              !g.settled &&
              (g.player1.toLowerCase() === account?.toLowerCase() ||
                g.player2.toLowerCase() === account?.toLowerCase()) && (
                <button
                  onClick={async () => {
                    try {
                      const gameContract = new ethers.Contract(
                        GAME_ADDRESS,
                        GameABI,
                        signer
                      );
                      const tx = await gameContract.settleGame(g.id);
                      await tx.wait();
                      await loadGames();
                    } catch (err) {
                      alert(err.reason || err.message || "Settle failed");
                    }
                  }}
                  style={{ marginLeft: 8 }}
                >
                  Settle Game
                </button>
              )}

            <input type="file" accept="application/json" onChange={handleRevealFile} />
          </div>

          {/* Player Teams */}
          {g.player1Revealed && (
            <div style={{ marginTop: 14 }}>
              <h4>🟥 Player 1 Team</h4>
              {g.player1TokenIds.map((id, i) => (
                <div key={i} style={{ marginLeft: 10 }}>
                  NFT #{id.toString()} — {g.player1Backgrounds[i] || "Unknown"}
                </div>
              ))}
            </div>
          )}

          {g.player2Revealed && (
            <div style={{ marginTop: 14 }}>
              <h4>🟦 Player 2 Team</h4>
              {g.player2TokenIds.map((id, i) => (
                <div key={i} style={{ marginLeft: 10 }}>
                  NFT #{id.toString()} — {g.player2Backgrounds[i] || "Unknown"}
                </div>
              ))}
            </div>
          )}

          {/* Settled Result */}
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
                  : g.winner.toLowerCase() === g.player1.toLowerCase()
                  ? "Player 1 wins"
                  : "Player 2 wins"}
              </h3>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                Winner address: {g.winner === ethers.ZeroAddress ? "—" : g.winner}
              </div>

              {/* Round-by-Round Details */}
              {g.roundResults && g.roundResults.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4>Round-by-Round Results</h4>
                  {g.roundResults.map((r, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 12, marginLeft: 12 }}>
                        🟥 P1 Traits: {r.p1.join(", ")}
                        <br />
                        🟦 P2 Traits: {r.p2.join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
  </div>
);
}