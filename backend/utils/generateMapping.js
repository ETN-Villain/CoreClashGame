import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";

import {
  IPFS_GATEWAYS,
  VKIN_CONTRACT_ADDRESS,
  VQLE_IPFS_BASE,
  RPC_URL,
} from "../config.js";

import {
  METADATA_JSON_DIR,
  METADATA_IMAGES_DIR,
  MAPPING_FILE,
} from "../paths.js";

/* ---------------- Paths ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VKIN_JSON_DIR = path.join(METADATA_JSON_DIR, "VKIN");
const VKIN_IMAGE_DIR = path.join(METADATA_IMAGES_DIR, "VKIN");
const VQLE_JSON_DIR = path.join(METADATA_JSON_DIR, "VQLE");
const VQLE_IMAGE_DIR = path.join(METADATA_IMAGES_DIR, "VQLE");

/* ---------------- Config ---------------- */
const VKIN_MAX_SUPPLY = 474;
const VQLE_MAX_SUPPLY = 30;
const VKIN_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];

/* ---------------- Helpers ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchWithRetries(
  ipfsUri,
  retriesPerGateway = 3,
  retryDelayMs = 5000,
  responseType = "arraybuffer"
) {
  const cidPath = ipfsUri.replace("ipfs://", "");

  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}/${cidPath}`;
    console.log(`🌐 Trying: ${url}`);

    for (let attempt = 1; attempt <= retriesPerGateway; attempt++) {
      try {
        const res = await axios.get(url, { responseType, timeout: 30_000 });
        return res.data;
      } catch (err) {
        if (err.code === "ENOTFOUND") break; // move to next gateway
        console.warn(
          `Attempt ${attempt}/${retriesPerGateway} failed for ${url}: ${err.message}`
        );
        if (attempt < retriesPerGateway) await sleep(retryDelayMs);
      }
    }
  }

  console.warn(`❌ All gateways failed for ${ipfsUri}`);
  return null;
}

/* ---------------- VKIN ---------------- */
async function generateVKIN(rows, provider) {
  ensureDir(VKIN_JSON_DIR);
  ensureDir(VKIN_IMAGE_DIR);

  const contract = new ethers.Contract(VKIN_CONTRACT_ADDRESS, VKIN_ABI, provider);

  for (let tokenId = 1; tokenId <= VKIN_MAX_SUPPLY; tokenId++) {
    let jsonFile;
    let metadata;

    // Fetch tokenURI from contract
    try {
      const tokenURI = await contract.tokenURI(tokenId);
      if (!tokenURI?.startsWith("ipfs://")) continue;

      // Determine JSON filename from IPFS path
      jsonFile = path.basename(tokenURI);

      const jsonPath = path.join(VKIN_JSON_DIR, jsonFile);

      if (fs.existsSync(jsonPath)) {
        metadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      } else {
        const rawJson = await fetchWithRetries(tokenURI, 3, 5000, "arraybuffer");
        if (!rawJson) continue;

        metadata = JSON.parse(rawJson.toString());
        fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
        console.log(`💾 Saved VKIN JSON ${jsonFile}`);
      }

      // Download image
      if (metadata.image?.startsWith("ipfs://")) {
        const imageFile = path.basename(metadata.image);
        const imagePath = path.join(VKIN_IMAGE_DIR, imageFile);
        if (!fs.existsSync(imagePath)) {
          const img = await fetchWithRetries(metadata.image, 3, 5000, "arraybuffer");
          if (img) {
            fs.writeFileSync(imagePath, img);
            console.log(`🖼️ Downloaded VKIN image ${imageFile}`);
          }
        }
      }

      rows.push(`VKIN,${tokenId},${jsonFile}`);
    } catch (err) {
      console.warn(`⚠️ VKIN tokenId ${tokenId} skipped: ${err.message}`);
    }

    await sleep(100);
  }
}

/* ---------------- VQLE ---------------- */
async function generateVQLE(rows) {
  ensureDir(VQLE_JSON_DIR);
  ensureDir(VQLE_IMAGE_DIR);

  const baseCid = VQLE_IPFS_BASE.replace(/https?:\/\/[^/]+\//, "");

  for (let tokenId = 1; tokenId <= VQLE_MAX_SUPPLY; tokenId++) {
    const jsonFile = `${tokenId}.json`;
    const jsonPath = path.join(VQLE_JSON_DIR, jsonFile);
    let metadata;

    if (fs.existsSync(jsonPath)) {
      metadata = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } else {
      const jsonUri = `ipfs://${baseCid}${jsonFile}`;
      const rawJson = await fetchWithRetries(jsonUri, 3, 5000, "arraybuffer");
      if (!rawJson) continue;

      metadata = JSON.parse(rawJson.toString());
      fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));
      console.log(`💾 Saved VQLE JSON ${jsonFile}`);
    }

    // Download image from metadata.image
    if (metadata.image?.startsWith("ipfs://")) {
      const imageFile = path.basename(metadata.image);
      const imagePath = path.join(VQLE_IMAGE_DIR, imageFile);

      if (!fs.existsSync(imagePath)) {
        const img = await fetchWithRetries(metadata.image, 3, 5000, "arraybuffer");
        if (img) {
          fs.writeFileSync(imagePath, img);
          console.log(`🖼️ Downloaded VQLE image ${imageFile}`);
        }
      }
    }

    rows.push(`VQLE,${tokenId},${jsonFile}`);
    await sleep(100);
  }
}

/* ---------------- Main ---------------- */
export async function generateMapping() {
  const rows = ["collection,token_id,token_uri"];
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  await generateVKIN(rows, provider);
  await generateVQLE(rows);

  fs.writeFileSync(MAPPING_FILE, rows.join("\n"));
  console.log("✅ mapping.csv + metadata + images complete");
}

/* ---------------- CLI ---------------- */
if (process.argv[1].endsWith("generateMapping.js")) {
  generateMapping().catch(console.error);
}
