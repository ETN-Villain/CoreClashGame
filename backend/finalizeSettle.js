// TEMP: Finalize settle helper (backend wallet)
import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import { GAME_ADDRESS, RPC_URL, BACKEND_PRIVATE_KEY } from "./config.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
const contract = new ethers.Contract(GAME_ADDRESS, GameABI, signer);

/**
 * Call this with node finalizeSettle.js <gameId>
 */
async function finalizeSettle(gameId) {
  try {
    console.log("⚡ Attempting on-chain settle for game", gameId);

    const tx = await contract.settleGame(BigInt(gameId));
    const receipt = await tx.wait();

    console.log("✅ Game settled on-chain!", receipt.transactionHash);
  } catch (err) {
    console.error("❌ Finalize settle failed:", err);
  }
}

// If running via command line: node finalizeSettle.js 3
if (process.argv[2]) {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id)) throw new Error("Invalid gameId");
  finalizeSettle(id);
}

export { finalizeSettle };
