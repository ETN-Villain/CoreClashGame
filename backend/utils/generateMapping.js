import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// --- Paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Write mapping.csv to backend root
const OUTPUT_FILE = path.resolve(__dirname, "../mapping.csv");

// --- Config ---
const RPC = "https://rpc.ankr.com/electroneum";
const contractAddress = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";
const maxSupply = 474;

const abi = [
  "function tokenURI(uint256 tokenId) view returns (string)"
];

// --- Helpers ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(contract, tokenId, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const uri = await contract.tokenURI(tokenId);
      if (uri && typeof uri === "string" && uri.length > 0) {
        return uri;
      }
      throw new Error("Empty URI");
    } catch (err) {
      console.log(`Token ${tokenId}: attempt ${attempt} failed (${err.message})`);
      if (attempt < retries) await sleep(500);
    }
  }
  return null;
}

// --- Main ---
export async function generateMapping() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(contractAddress, abi, provider);

  let rows = ["token_id,token_uri"];

  for (let id = 1; id <= maxSupply; id++) {
    console.log(`Processing token ${id}/${maxSupply}…`);

    const uri = await fetchWithRetry(contract, id);

    if (!uri) {
      rows.push(`${id},ERROR`);
      continue;
    }

    const fileName = uri.split("/").pop();
    rows.push(`${id},${fileName}`);
  }

  fs.writeFileSync(
    new URL("../mapping.csv", import.meta.url),
    rows.join("\n")
  );

  console.log("mapping.csv generated.");
}