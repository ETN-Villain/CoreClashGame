import { ethers } from "ethers";
import React from "react";
import mapping from "./mapping.json"; // Frontend mapping
import { BACKEND_URL } from "./config.js"

const addressToCollection = {
  "0x3fc7665b1f6033ff901405cddf31c2e04b8a2ab4": "VKIN",
  "0x3FC7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cfbb04c54d35e2e8471ad9040d40d73c08136f0": "VQLE",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
  // add more if needed
};

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/* ---------------- Stable Image Component ---------------- */
export const StableImage = ({ src, alt }) => {
  const [status, setStatus] = React.useState('loading');

  React.useEffect(() => {
    setStatus('loading');
  }, [src]);

  return (
    <div style={{ 
      position: 'relative', 
      width: 80, 
      height: 120,           // fixed size
      background: '#111',
      borderRadius: 6,
      overflow: 'hidden',
      border: '1px solid #333',
    }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',               // keep fill + crop
          objectPosition: 'top center',     // ← CHANGED: prioritize top/head area
          opacity: status === 'success' ? 1 : 0.4,
          transition: 'opacity 0.2s ease',
        }}
        onLoad={() => setStatus('success')}
        onError={() => setStatus('error')}
      />
      {status !== 'success' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(17, 17, 17, 0.7)',
            color: status === 'error' ? '#ff5555' : '#888',
            fontSize: 24,
            borderRadius: 6,
          }}
        >
          {status === 'error' ? '×' : '...'}
        </div>
      )}
    </div>
  );
};

/* ---------------- GameCard Component ---------------- */
export default function GameCard({
  g,
  account,
  signer,
  approveTokens,
  joinGame,
  manualSettleGame,
  handleRevealFile,
  cancelUnjoinedGame,
  roundResults = [],
}) {
  const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
  const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();

// Compute totals (WEI-SAFE)
const stakeWei = BigInt(g.stakeAmount || 0);
const totalPotWei = stakeWei * 2n;

const winnerAddress = g.winner;
const tie = !winnerAddress || winnerAddress === ethers.ZeroAddress;

// 1% burn
const burnPercent = 1;
const burnWei = (totalPotWei * BigInt(burnPercent)) / 100n;

// Player winnings (95% if not tie)
const playerWinningsWei = tie
  ? totalPotWei / 2n
  : (totalPotWei * 95n) / 100n;

// 🔽 Keep original const names (formatted for UI)\
const stakeAmount = ethers.formatUnits(stakeWei, 18);
const totalPot = ethers.formatUnits(totalPotWei, 18);
const burnAmount = ethers.formatUnits(burnWei, 18);
const playerWinnings = ethers.formatUnits(playerWinningsWei, 18);

/* ----- Deadline Calculation ----- */
const revealDeadlinePassed =
  g.player2JoinedAt &&
  Date.now() - new Date(g.player2JoinedAt).getTime() >= FIVE_DAYS_MS;

  /* --------- GAME STATES --------- */
  const isCancelled = g.cancelled === true || g.cancelled === "true";
  const isSettled = g.settled === true || g.settled === "true" || isCancelled;

  const canJoin =
    g.player2 === ethers.ZeroAddress &&
    !isPlayer1 &&
    !isPlayer2 &&
    !isCancelled &&
    !isSettled &&
    !!account &&
    !!signer;

  const bothRevealed = g.player1Revealed && g.player2Revealed;
  const canSettle = bothRevealed && !isSettled;

  /* ---------------- Render Token Images ---------------- */
  const renderTokenImages = (input = []) => {
    let tokens = [];

    if (Array.isArray(input)) tokens = input;
    else if (input && typeof input === "object") {
      const { nftContracts = [], tokenIds = [], tokenURIs = [] } = input;

      tokens = tokenIds.map((id, idx) => {
        const rawAddr = nftContracts[idx];
        let addr = (rawAddr || "").toString().trim().replace(/[^0-9a-fA-F]/gi, "").toLowerCase();
        if (addr && !addr.startsWith("0x")) addr = "0x" + addr;

        let collection = addressToCollection[addr] || (addr.includes("8cfbb04c") ? "VQLE" : "VKIN");

        let imageFile = `${id}.png`;
        const mappedEntry = mapping[collection]?.[String(id)];

        if (mappedEntry) {
          if (mappedEntry.image_file) imageFile = mappedEntry.image_file;
          else if (mappedEntry.token_uri) imageFile = mappedEntry.token_uri.replace(/\.json$/i, ".png").toLowerCase();
        } else if (tokenURIs[idx]) {
          imageFile = tokenURIs[idx].replace(/\.json$/i, ".png").toLowerCase();
        }

        return { collection, tokenId: id, imageFile };
      });
    }

    if (!tokens.length) return null;

    return (
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {tokens.map((token, i) => {
          const { collection, tokenId, imageFile } = token;
          const src = `${BACKEND_URL}/images/${collection}/${imageFile}`;
          return <StableImage key={`${collection}-${tokenId || i}-${i}`} src={src} alt={`${collection} #${tokenId || "?"}`} />;
        })}
      </div>
    );
  };

  /* ---------------- Render JSX ---------------- */
  return (
    <div
      style={{
        border: "1px solid #444",
        padding: 14,
        marginBottom: 14,
        opacity: isCancelled ? 0.6 : 1,
        backgroundColor: isCancelled ? "#111" : "transparent",
      }}
    >
      {/* Cancelled Banner */}
      {isCancelled && (
        <div
          style={{
            backgroundColor: "rgba(255, 68, 68, 0.2)",
            border: "1px solid #ff4444",
            borderRadius: 6,
            padding: "12px",
            marginBottom: 12,
            color: "#ff5555",
            fontWeight: "bold",
            textAlign: "center",
            fontSize: 16,
          }}
        >
          ⚠️ Game Cancelled
          <div style={{ fontSize: 13, fontWeight: "normal", marginTop: 4, opacity: 0.9 }}>
            Stake refunded on-chain
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 0, marginBottom: 6 }}>Game #{g.id}</h3>

{!isSettled && (
  <>
    {/* Player 1 */}
    <div>
      🟥 Player 1: {g.player1 ? `0x...${g.player1.slice(-5)}` : "Waiting for opponent"}
    </div>

    {/* Player 2 */}
    <div style={{ marginTop: 6, opacity: isCancelled ? 0.6 : 1 }}>
      🟦 Player 2:{" "}
      {g.player2 && g.player2 !== ethers.ZeroAddress
        ? `0x...${g.player2.slice(-5)}`
        : "Waiting for opponent"}
    </div>

<div style={{ fontSize: 14, marginTop: 6, opacity: isCancelled ? 0.6 : 1 }}>
  Stake:{" "}
{stakeAmount ? Number(stakeAmount) : 0}
</div>
  </>
)}

      {/* Cancel Button – only for unjoined games */}
      {isPlayer1 && g.player2 === ethers.ZeroAddress && !isSettled && !isCancelled && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => cancelUnjoinedGame(g.id)}
            disabled={!signer}
            style={{
              background: "#ff4444",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              cursor: signer ? "pointer" : "not-allowed",
              opacity: signer ? 1 : 0.5,
            }}
          >
            Cancel Game (Refund Stake)
          </button>

          <div style={{ fontSize: 12, color: "#ff9999", marginTop: 4 }}>Only available before someone joins</div>
        </div>
      )}

      {/* Hidden Teams */}
      {!isSettled && !bothRevealed && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>🔒 Teams hidden until both players reveal</div>
      )}

      {/* Join / Approve */}
      {!isCancelled && !isSettled && canJoin && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => approveTokens(g.stakeToken, stakeAmount)}
            disabled={!signer}
            style={{
              background: "#333",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: signer ? "pointer" : "not-allowed",
            }}
          >
            Approve
          </button>
          <button
            onClick={() => joinGame(g.id)}
            style={{
              background: "#18bb1a",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Join Game
          </button>
        </div>
      )}

{/* Reveal Upload + Expired Settle */}
{g.player2 !== ethers.ZeroAddress &&
  !isSettled &&
  !isCancelled &&
  (
    ((isPlayer1 && !g.player1Revealed) ||
     (isPlayer2 && !g.player2Revealed)) ||
    revealDeadlinePassed
  ) && (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {/* Upload Reveal (only if still allowed) */}
      {!revealDeadlinePassed && (
        <>
          <button
            onClick={() => document.getElementById(`reveal-file-${g.id}`).click()}
            style={{
              background: "#18bb1a",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Upload Reveal
          </button>

          <input
            id={`reveal-file-${g.id}`}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleRevealFile}
          />
        </>
      )}

{/* Settle after 5 days */}
{revealDeadlinePassed && (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <button
      onClick={() => manualSettleGame(g.id)}
      style={{
        background: "#ff9800",
        color: "#000",
        padding: "6px 12px",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      Settle Game
    </button>

    <div style={{ fontSize: 12, color: "#ffb74d" }}>
      ⏱ Reveal window expired
    </div>
  </div>
)}
  
  {/* Manual Settle */}
  {canSettle && !isCancelled && (
    <button
      onClick={() => manualSettleGame(g.id)}
      style={{
        background: "#18bb1a",
        color: "#fff",
        padding: "6px 12px",
        borderRadius: 4,
        cursor: "pointer",
        marginLeft: 8,
      }}
    >
      Settle Game
    </button>
  )}
</div>
  )}

  {/* Teams + Round Results */}
      {bothRevealed && (
        <div style={{ marginTop: 16 }}>
          {/* Player 1 Team */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: "bold", color: "#ff5555", marginBottom: 8, textAlign: "left" }}>🟥 Player 1 Team: {g.player1 ? `0x...${g.player1.slice(-5)}` : "—"}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>
        Stake: {Number(stakeAmount).toFixed(2)}
      </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>{renderTokenImages(g.player1Reveal)}</div>
          </div>

          {/* Round Results */}
          {isSettled && g.winner && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: "bold", marginBottom: 8, fontSize: 20, color: "#aaa", textAlign: "center" }}>📊 Round Results</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                {g.roundResults.map((r) => (
                  <div
                    key={r.round}
                    style={{
                      padding: "4px 4px",
                      borderRadius: 20,
                      backgroundColor: r.winner === "player1" ? "#ff5555" : "#4da3ff",
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: 16,
                      minWidth: 70,
                      textAlign: "center",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                    }}
                  >
                    R{r.round}: {r.winner === "player1" ? "P1" : "P2"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player 2 Team */}
          <div>
            <div style={{ fontWeight: "bold", color: "#4da3ff", marginBottom: 8, textAlign: "left" }}>🟦 Player 2 Team: {g.player2 ? `0x...${g.player2.slice(-5)}` : "—"}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>
        Stake: {Number(stakeAmount).toFixed(2)}
      </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>{renderTokenImages(g.player2Reveal)}</div>
          </div>
        </div>
      )}
<div
  style={{
    marginTop: 12,
    padding: 12,
    background: "#111", // dark card background
    borderRadius: 8,
    textAlign: "center",
    color: "#fff",
    boxShadow: "0 0 10px rgba(0,0,0,0.5)"
  }}
>
{/* Winner Card */}
{isSettled && g.winner && (
<div
  style={{
    marginTop: 2,
    padding: 8,
    borderRadius: 12,
    textAlign: "center",
    background: "#111",
    boxShadow: "0 0 20px rgba(0,0,0,0.7)",
    color: "#fff",
  }}
>
  {/* Determine winner */}
  {winnerAddress ? (
    <div
      style={{
        fontWeight: "bold",
        marginBottom: 6,
        fontSize: 22,
        letterSpacing: 1,
        textTransform: "uppercase",
        color:
          winnerAddress.toLowerCase() === g.player1.toLowerCase()
            ? "#ff2d55" // Neon red
            : "#4da3ff", // Neon blue
        textShadow:
          winnerAddress.toLowerCase() === g.player1.toLowerCase()
            ? "0 0 8px #ff2d55, 0 0 16px #ff2d55"
            : "0 0 8px #4da3ff, 0 0 16px #4da3ff",
      }}
    >
      🏆 {winnerAddress.toLowerCase() === g.player1.toLowerCase() ? "PLAYER 1 WINS!" : "PLAYER 2 WINS!"}
    </div>
  ) : (
    <div style={{ fontSize: 18, color: "#888" }}>🤝 Tie Game</div>
  )}
  
  {/* Total Pot */}
  <div style={{ fontSize: 14, marginBottom: 4 }}>
    Total Pot: {totalPot} $CORE
  </div>

  {/* Player Winnings */}
  <div style={{ fontSize: 28, fontWeight: "bold", color: "#0f0", marginBottom: 4 }}>
    Winnings: {playerWinnings} $CORE
  </div>

  {/* Core Burn */}
  <div style={{ fontSize: 16, color: "#f50", display: "flex", justifyContent: "center", alignItems: "center" }}>
    🔥 Core Burn: {burnAmount} $CORE 🔥
  </div>
</div>
)}
    </div>
  </div>
  );
}