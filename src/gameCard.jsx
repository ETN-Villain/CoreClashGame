import { ethers } from "ethers";
import React from "react";
import mapping from "./mapping.json"; // Frontend mapping

const BACKEND_URL = "http://localhost:3001";

const addressToCollection = {
  "0x3fc7665b1f6033ff901405cddf31c2e04b8a2ab4": "VKIN",
  "0x3FC7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cfbb04c54d35e2e8471ad9040d40d73c08136f0": "VQLE",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
  // add more if needed
};

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

  console.log(`Game #${g.id} reveal status:`, {
    bothRevealed,
    p1Revealed: g.player1Revealed,
    p2Revealed: g.player2Revealed,
    p1RevealExists: !!g.player1Reveal,
    p2RevealExists: !!g.player2Reveal,
    p1TokenURIs: g.player1Reveal?.tokenURIs,
    p2TokenURIs: g.player2Reveal?.tokenURIs,
  });

  /* ---------------- Render Token Images ---------------- */
  const renderTokenImages = (input = []) => {
    let tokens = [];

    if (Array.isArray(input)) {
      tokens = input;
    } else if (input && typeof input === 'object') {
      const { nftContracts = [], tokenIds = [], tokenURIs = [] } = input;

      console.log("[renderTokenImages] Backend reveal data:", {
        tokenIds,
        tokenURIs,
        nftContracts,
      });

      tokens = tokenIds.map((id, idx) => {
        const rawAddr = nftContracts[idx];

        // Normalize address
        let addr = (rawAddr || "").toString().trim()
          .replace(/[^0-9a-fA-F]/gi, '')
          .toLowerCase();

        if (addr && !addr.startsWith('0x')) {
          addr = '0x' + addr;
        }

        let collection = addressToCollection[addr];

        // Fallback pattern for VQLE (in case of minor mismatches)
        if (!collection && addr.includes('8cfbb04c')) {
          console.log(`Slot ${idx} VQLE pattern match (raw: ${rawAddr})`);
          collection = "VQLE";
        }

        if (!collection) {
          console.warn(`Slot ${idx} No collection match for "${addr}" (raw: "${rawAddr}") — defaulting to VKIN`);
          collection = "VKIN";
        }

        console.log(`Slot ${idx} collection: ${collection}, tokenId: ${id}`);

        // ── Decide image filename ──
        let imageFile = `${id}.png`; // ultimate fallback

        // Mapping.json is primary source for correct/remapped image
        const mappedEntry = mapping[collection]?.[String(id)];

        if (mappedEntry) {
          if (mappedEntry.image_file) {
            imageFile = mappedEntry.image_file;
            console.log(`Slot ${idx}: using explicit image_file from mapping → ${imageFile}`);
          } else if (mappedEntry.token_uri) {
            imageFile = mappedEntry.token_uri
              .replace(/\.json$/i, ".png")
              .toLowerCase();
            console.log(`Slot ${idx}: derived from mapping.token_uri → ${imageFile}`);
          } else {
            console.warn(`Slot ${idx}: mapping entry exists but no image_file or token_uri`);
          }
        }
        // Backend tokenURI only as last resort
        else if (tokenURIs[idx]) {
          imageFile = tokenURIs[idx]
            .replace(/\.json$/i, ".png")
            .toLowerCase();
          console.warn(`Slot ${idx}: no mapping entry → fallback to backend tokenURI → ${imageFile}`);
        } else {
          console.warn(`Slot ${idx}: no mapping & no tokenURI → using ${imageFile}`);
        }

        console.log(`Slot ${idx} final imageFile: ${imageFile} (source: ${mappedEntry ? 'mapping.json' : (tokenURIs[idx] ? 'backend' : 'fallback')})`);

        return {
          collection,
          tokenId: id,
          imageFile,
        };
      });
    }

    if (!tokens.length) {
      console.log("[renderTokenImages] No tokens to render");
      return null;
    }

    return (
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {tokens.map((token, i) => {
          const { collection, tokenId, imageFile } = token;

          const src = `${BACKEND_URL}/images/${collection}/${imageFile}`;

          console.log(`Rendering slot ${i}: ${src}`);

          return (
            <StableImage
              key={`${collection}-${tokenId || i}-${i}`}
              src={src}
              alt={`${collection} #${tokenId || '?'}`}
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

      {/* PLAYER 2 */}
      <div style={{ marginTop: 6 }}>
        🟦 Player 2: {g.player2 && g.player2 !== ethers.ZeroAddress ? `0x...${g.player2.slice(-5)}` : "Waiting for opponent"}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>
        Stake: {g.player2 !== ethers.ZeroAddress && g.stakeAmount ? Number(ethers.formatUnits(g.stakeAmount, 18)) : 0}
      </div>

      {/* ── TEAM IMAGES + WINNER / RESULTS ── */}
      {bothRevealed ? (
        <div style={{ marginTop: 16 }}>
          {/* Winner announcement */}
          {g.settled && g.winner && (
            <div style={{ marginBottom: 12, fontWeight: "bold", fontSize: 18, textAlign: "center" }}>
              🏆{" "}
              {g.winner === ethers.ZeroAddress
                ? "It's a Draw!"
                : g.winner.toLowerCase() === g.player1?.toLowerCase()
                ? "Player 1 Wins!"
                : "Player 2 Wins!"}
            </div>
          )}

          {/* Player 1 Team */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: "bold", color: "#ff5555", marginBottom: 6 }}>
              Player 1 Team
            </div>
            {renderTokenImages(g.player1Reveal)}
          </div>

          {/* Player 2 Team */}
          <div>
            <div style={{ fontWeight: "bold", color: "#4da3ff", marginBottom: 6 }}>
              Player 2 Team
            </div>
            {renderTokenImages(g.player2Reveal)}
          </div>
        </div>
      ) : (
        <div />
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
      {g.settled && (
        <div style={{
          marginTop: 20,
          padding: 12,
          background: "rgba(40, 40, 40, 0.6)",
          borderRadius: 8,
          border: "1px solid #444",
          textAlign: "center",
        }}>
          {g.winner && (
            <div style={{
              fontSize: 22,
              fontWeight: "bold",
              marginBottom: 12,
              color: g.winner === ethers.ZeroAddress 
                ? "#ccc" 
                : g.winner.toLowerCase() === g.player1?.toLowerCase() 
                  ? "#ffeb3b" 
                  : "#4da3ff",
            }}>
              🏆 {g.winner === ethers.ZeroAddress 
                ? "It's a Draw!" 
                : g.winner.toLowerCase() === g.player1?.toLowerCase() 
                  ? "Player 1 Wins!" 
                  : "Player 2 Wins!"}
            </div>
          )}

          {roundResults.length > 0 && (
            <>
              <div style={{
                fontWeight: "bold",
                marginBottom: 8,
                fontSize: 16,
                color: "#aaa",
              }}>
                📊 Round Results
              </div>
              <div style={{
                display: "flex",
                justifyContent: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 12,
              }}>
                {roundResults.map((r) => (
                  <div
                    key={r.round}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 20,
                      backgroundColor: r.winner === "player1" ? "#ff5555" : "#4da3ff",
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: 14,
                      minWidth: 70,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                    }}
                  >
                    R{r.round}: {r.winner === "player1" ? "P1" : "P2"}
                  </div>
                ))}
              </div>
            </>
          )}

          {g.stakeAmount && (
            <div style={{
              fontSize: 20,
              color: "#aaa",
              marginTop: 8,
              fontWeight: "bold"
            }}>
              💰 Total Pot: {Number(ethers.formatUnits(g.stakeAmount, 18)) * 2}
            </div>
          )}
        </div>
      )}
    </div>
  );
}