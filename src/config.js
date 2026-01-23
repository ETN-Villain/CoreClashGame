export const GAME_ADDRESS = "0xBB9ec09EAB6D680E2A6c4794C34A9B3C0208fce2";
export const CHAIN_ID = 52014; // Electroneum mainnet (example)
export const RPC_URL = "https://rpc.ankr.com/electroneum";
export const IPFS_BASE = "https://ipfs.io/ipfs/QmZMPmh6qg31NqH5tFKoQ5k3uMDBNMxkQUS7tyqCZstUNv/";
export const VQLE_IPFS_BASE = "https://ipfs.io/ipfs/bafybeic2zhpgnjbzmvzxnsdjhs74aym5j7ain4kgwgat3dym53g3sbmghe/";
export const RARE_BACKGROUNDS = ["Gold", "Silver", "Verdant Green", "Rose Gold"];
export const CORE_TOKEN = "0x309B916b3A90cb3E071697Ea9680e9217A30066f";
export const ADMIN_ADDRESS = "0x3Fd2e5B4AC0efF6DFDF2446abddAB3f66B425099"
export const BACKEND_URL = "http://localhost:3001";

// ---------------- WHITELISTED TOKENS ----------------
export const WHITELISTED_TOKENS = [
  { label: "CORE", address: CORE_TOKEN }
];

// ---------------- WHITELISTED NFTs ----------------
export const WHITELISTED_NFTS = [
  { label: "Verdant Kin", address: "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4" },
  { label: "Verdant Queen", address: "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0" }
];

// src/constants/collections.js (recommended) or inside renderTokenImages.jsx
export const ADDRESS_TO_COLLECTION_KEY = {
  "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4": "VKIN",
  "0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0": "VQLE",
};
