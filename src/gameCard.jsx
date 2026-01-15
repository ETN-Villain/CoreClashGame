import { ethers } from "ethers";

export default function GameCard({
  g,
  account,
  signer,
  approveTokens,
  joinGame,
  manualSettleGame,
  handleRevealFile,
  renderTeamImages,
}) {
  const isPlayer1 = g.player1?.toLowerCase() === account?.toLowerCase();
  const isPlayer2 = g.player2?.toLowerCase() === account?.toLowerCase();

  const canJoin =
    g.player2 === ethers.ZeroAddress &&
    !isPlayer1 &&
    !isPlayer2 &&
    !!account &&
    !!signer;

  const bothRevealed =
    g.player1Revealed === true &&
    g.player2Revealed === true;

  const canSettle = bothRevealed && !g.settled;

  return (
    <div
      style={{
        border: "1px solid #444",
        padding: 14,
        marginBottom: 14,
      }}
    >
      <h3>Game #{g.id}</h3>

{/* ---------------- PLAYER INFO & STAKES ---------------- */}
<div style={{ marginBottom: 8 }}>
  {/* Player 1 */}
  <div>🟥 Player 1: {g.player1 ? `0x...${g.player1.slice(-5)}` : "Waiting for opponent"}</div>
  <div style={{ fontSize: 14, marginTop: 2 }}>
    Stake: {g.stakeAmount ? Number(ethers.formatUnits(g.stakeAmount, 18)) : 0}
  </div>
  {/* Player 1 team (only if revealed) */}
  {g.player1Revealed && renderTeamImages(g.player1Reveal)}

  {/* Player 2 */}
  <div style={{ marginTop: 6 }}>
    🟦 Player 2: {g.player2 && g.player2 !== ethers.ZeroAddress ? `0x...${g.player2.slice(-5)}` : "Waiting for opponent"}</div>
  <div style={{ fontSize: 14, marginTop: 2 }}>
    Stake: {g.player2 !== ethers.ZeroAddress && g.stakeAmount ? Number(ethers.formatUnits(g.stakeAmount, 18)) : 0}
  </div>
  {/* Player 2 team (only if revealed) */}
  {g.player2Revealed && renderTeamImages(g.player2Reveal)}

  {/* Total stake */}
  {g.player2 !== ethers.ZeroAddress && g.stakeAmount && (
    <div style={{ marginTop: 4, fontWeight: "bold" }}>
      💰 Total Pot: {Number(ethers.formatUnits(g.stakeAmount, 18)) * 2}
    </div>
  )}
</div>

      {!bothRevealed && (
        <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
          🔒 Teams hidden until both players reveal
        </div>
      )}

{/* Join / Approve (Player 2 only) */}
{canJoin && (
  <div
    style={{
      display: "flex",
      gap: 8,
      marginTop: 10,
    }}
  >
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

{/* Reveal upload */}
{g.player2 !== ethers.ZeroAddress &&
  ((isPlayer1 && !g.player1Revealed) || (isPlayer2 && !g.player2Revealed)) && (
    <label style={{ marginLeft: 8, cursor: "pointer" }}>
      Upload Reveal
      <input
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleRevealFile} // still from App.js
      />
    </label>
)}

      {canSettle && (
        <button
          onClick={() => manualSettleGame(g.id)}
          style={{ marginTop: 8 }}
        >
          Settle Game
        </button>
      )}

      {g.settled && (
        <div style={{ marginTop: 12 }}>
          🏆{" "}
          {g.winner === ethers.ZeroAddress
            ? "Draw"
            : g.winner?.toLowerCase() ===
              g.player1?.toLowerCase()
            ? "Player 1 wins"
            : "Player 2 wins"}
        </div>
      )}
    </div>
  );
}