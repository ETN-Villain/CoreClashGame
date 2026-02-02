// backend/admin.js
import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" assert { type: "json" };
import { GAME_ADDRESS, BACKEND_PRIVATE_KEY, RPC_URL } from "./config.js";

export let adminWalletReady = false;
export let adminSigner = null;
export let adminContract = null;

export function initAdminWallet() {
  if (!BACKEND_PRIVATE_KEY) {
    throw new Error("BACKEND_PRIVATE_KEY missing");
  }

  if (!BACKEND_PRIVATE_KEY.startsWith("0x")) {
    throw new Error("Backend private key must start with 0x");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  adminSigner = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);
  adminContract = new ethers.Contract(GAME_ADDRESS, GameABI, adminSigner);

  adminWalletReady = true;

  console.log("🔐 Admin wallet initialized:", adminSigner.address);
}