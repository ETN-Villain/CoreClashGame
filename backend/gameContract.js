import { ethers } from "ethers";
import GameABI from "../src/abis/GameABI.json" with { type: "json" };
import { RPC_URL, GAME_ADDRESS, BACKEND_PRIVATE_KEY } from "./config.js";

export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const adminWallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, provider);

export const gameReadContract = new ethers.Contract(
  GAME_ADDRESS,
  GameABI,
  provider
);

export const gameWriteContract = new ethers.Contract(
  GAME_ADDRESS,
  GameABI,
  adminWallet
);