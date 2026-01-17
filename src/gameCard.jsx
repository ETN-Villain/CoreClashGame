import { ethers } from "ethers";
import React from "react";
import mapping from "./mapping.json"; // Frontend mapping

const BACKEND_URL = "http://localhost:3001";

/* ---------------- Stable Image Component ---------------- */
export const StableImage = ({ src, alt }) => {
  const [status, setStatus] = React.useState('loading');

  React.useEffect(() => {
    setStatus('loading');
  }, [src]);

  return (
    <div style={{ position: 'relative', width: 80, height: 80 }}>
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          border: '1px solid #333',
          borderRadius: 6,
          opacity: status === 'success' ? 1 : 0.4,
          transition: 'opacity 0.2s',
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
            background: '#111',
            color: status === 'error' ? '#ff5555' : '#888',
            fontSize: 20,
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
  roundResults = [],
}) {
  const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
  const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();

  const canJoin =
    g.player2 === ethers.ZeroAddress &&
    !isPlayer1 &&
    !isPlayer2 &&
    !!account &&
    !!signer;

  const bothRevealed = g.player1Revealed && g.player2Revealed;
  const canSettle = bothRevealed && !g.settled;

  /* ---------------- Render Token Images ---------------- */
const renderTokenImages = (tokens = []) => {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
{tokens.map((token, i) => {
  const { collection, tokenId, metadata } = token || {};

  // ── Log at the very start of each iteration ──
  console.log(`Processing slot ${i}:`, { 
    hasToken: !!token, 
    collection, 
    tokenId, 
    tokenIdType: typeof tokenId,
    metadataExists: !!metadata 
  });

  if (!collection || !tokenId) {
    console.log(`Slot ${i} → skeleton (missing collection or tokenId)`);
    return <div key={`skeleton-${i}`} style={{width:80, height:80, background:'#111', border:'1px solid #333', borderRadius:6}} />;
  }

  const lookupId = String(tokenId); // ← already fixed to string

  let jsonFile = null;
  let imageFile = null;

  if (collection === "VKIN") {
    const mapped = mapping[collection]?.[lookupId];
    if (mapped) {
      jsonFile = mapped;
      imageFile = mapped.replace(/\.json$/i, ".png").toLowerCase();
      console.log(`VKIN hit mapping: ${lookupId} → ${jsonFile} → ${imageFile}`);
    } else {
      imageFile = `${tokenId}.png`.toLowerCase();
      console.log(`VKIN fallback: ${imageFile}`);
    }
  } else if (collection === "VQLE") {
    // ... your VQLE logic ...
    imageFile = (metadata?.image?.split("/").pop() || `${tokenId}.png`).toLowerCase();
  } else {
    imageFile = `${tokenId}.png`.toLowerCase();
  }

  const src = `${BACKEND_URL}/images/${collection}/${imageFile}`;

  // ── This should now appear if we reach here ──
  console.log(`Rendering ${collection} #${tokenId} → ${src}`);

  const key = `${collection}-${tokenId}-${i}`;

return (
  <StableImage
    key={key}
    src={src}
    alt={token.metadata?.name || `${collection} #${tokenId}`}
  />
);
})}
    </div>
  );
};

  /* ---------------- Render JSX ---------------- */
  return (
    <div style={{ border: "1px solid #444", padding: 14, marginBottom: 14 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>Game #{g.id}</h3>

      {/* PLAYER 1 */}
      <div>
        🟥 Player 1: {g.player1 ? `0x...${g.player1.slice(-5)}` : "Waiting for opponent"}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>
        Stake: {g.stakeAmount ? Number(ethers.formatUnits(g.stakeAmount, 18)) : 0}
      </div>
{g.player1Revealed && renderTokenImages(g.player1Reveal?.tokenURIs || [])}
console.log("Passing to renderTokenImages (P1):", g.player1Reveal?.tokenURIs);

      {/* PLAYER 2 */}
      <div style={{ marginTop: 6 }}>
        🟦 Player 2: {g.player2 && g.player2 !== ethers.ZeroAddress ? `0x...${g.player2.slice(-5)}` : "Waiting for opponent"}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>
        Stake: {g.player2 !== ethers.ZeroAddress && g.stakeAmount ? Number(ethers.formatUnits(g.stakeAmount, 18)) : 0}
      </div>
{g.player2Revealed && renderTokenImages(g.player2Reveal?.tokenURIs || [])}
console.log("Passing to renderTokenImages (P2):", g.player2Reveal?.tokenURIs);

      {/* TOTAL POT */}
      {g.player2 !== ethers.ZeroAddress && g.stakeAmount && (
        <div style={{ marginTop: 4, fontWeight: "bold" }}>
          💰 Total Pot: {Number(ethers.formatUnits(g.stakeAmount, 18)) * 2}
        </div>
      )}

      {/* HIDDEN TEAMS */}
      {!bothRevealed && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
          🔒 Teams hidden until both players reveal
        </div>
      )}

      {/* JOIN / APPROVE */}
      {canJoin && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={() => approveTokens(g.stakeToken, g.stakeAmount)}
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

      {/* REVEAL UPLOAD */}
      {g.player2 !== ethers.ZeroAddress &&
        ((isPlayer1 && !g.player1Revealed) || (isPlayer2 && !g.player2Revealed)) && (
          <label style={{ marginLeft: 8, cursor: "pointer" }}>
            Upload Reveal
            <input type="file" accept=".json" style={{ display: "none" }} onChange={handleRevealFile} />
          </label>
      )}

      {/* MANUAL SETTLE */}
      {canSettle && (
        <button onClick={() => manualSettleGame(g.id)} style={{ marginTop: 8 }}>
          Settle Game
        </button>
      )}

      {/* WINNER / ROUND RESULTS */}
      {g.settled && g.winner && (
        <div style={{ marginTop: 12, fontWeight: "bold" }}>
          🏆{" "}
          {g.winner === ethers.ZeroAddress
            ? "Draw"
            : g.winner.toLowerCase() === g.player1?.toLowerCase()
            ? "Player 1 wins"
            : "Player 2 wins"}
        </div>
      )}
      {g.settled && roundResults.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>📊 Round Results</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            {roundResults.map((r) => (
              <div
                key={r.round}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "2px 6px",
                  borderRadius: 4,
                  backgroundColor: r.winner === "player1" ? "#ff5555" : "#4da3ff",
                  color: "#fff",
                  fontWeight: "bold",
                  fontSize: 12,
                }}
              >
                R{r.round}: {r.winner === "player1" ? "P1" : "P2"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
