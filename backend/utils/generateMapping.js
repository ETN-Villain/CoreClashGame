import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { IPFS_GATEWAY } from "../config.js";
import { METADATA_JSON_DIR, MAPPING_FILE } from "../paths.js";

/* ------------------ Paths ------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSON_DIR = METADATA_JSON_DIR;
const IMAGE_DIR = path.join(JSON_DIR, "images");
const OUTPUT_CSV = MAPPING_FILE;

/* ------------------ Config ------------------ */
const RPC = "https://rpc.ankr.com/electroneum";
const CONTRACT_ADDRESS = "0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4";
const MAX_SUPPLY = 474;
const ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];

/* ------------------ Helpers ------------------ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/* ------------------ Main ------------------ */
export async function generateMapping(fullRefresh = false) {
  ensureDirs();

  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const rows = ["token_id,token_uri"];

  // Load existing CSV if not full refresh
  if (!fullRefresh && fs.existsSync(OUTPUT_CSV)) {
    const existing = fs.readFileSync(OUTPUT_CSV, "utf8").split("\n").slice(1).filter(Boolean);
    rows.push(...existing);
  }

  for (let tokenId = 1; tokenId <= MAX_SUPPLY; tokenId++) {
    console.log(`Processing token ${tokenId}/${MAX_SUPPLY}`);

    // Skip if already in CSV
    if (rows.some(r => r.startsWith(`${tokenId},`))) continue;

    let tokenURI;
    try {
      tokenURI = await contract.tokenURI(tokenId);
    } catch {
      console.warn(`⚠️ token ${tokenId} not found on chain → skipping`);
      continue;
    }

    if (!tokenURI?.startsWith("ipfs://")) {
      console.warn(`⚠️ token ${tokenId} has invalid URI → skipping`);
      continue;
    }

    const jsonFile = tokenURI.split("/").pop();
    const jsonPath = path.join(JSON_DIR, jsonFile);

    // Skip if JSON already exists
    if (!fullRefresh && fs.existsSync(jsonPath)) {
      console.log(`✔ JSON exists → skipping fetch`);
      rows.push(`${tokenId},${jsonFile}`);
      continue;
    }

    // Fetch JSON
    const rawJson = await fetchFromIPFS(tokenURI, "arraybuffer");
    if (!rawJson) {
      console.warn(`⚠️ token ${tokenId} JSON fetch failed → skipping`);
      continue;
    }

    const metadata = JSON.parse(rawJson.toString());
    fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

    // Fetch image if present
    if (metadata.image?.startsWith("ipfs://")) {
      const imageFile = metadata.image.split("/").pop();
      const imagePath = path.join(IMAGE_DIR, imageFile);

      if (fullRefresh || !fs.existsSync(imagePath)) {
        const rawImage = await fetchFromIPFS(metadata.image, "arraybuffer");
        if (rawImage) fs.writeFileSync(imagePath, rawImage);
      }
    }

    rows.push(`${tokenId},${jsonFile}`);
    await sleep(400);
  }

  fs.writeFileSync(OUTPUT_CSV, rows.join("\n"));
  console.log("✅ mapping.csv + JSON + images cached");
}

/* ------------------ CLI ------------------ */
if (process.argv[1].endsWith("generateMapping.js")) {
  const full = process.argv[2] === "true";
  generateMapping(full).catch(console.error);
}
