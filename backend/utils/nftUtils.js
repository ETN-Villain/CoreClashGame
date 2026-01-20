import { ethers } from "ethers";
import { RPC_URL, VKIN_CONTRACT_ADDRESS, VQLE_CONTRACT_ADDRESS } from "../config.js";
import VKIN_ABI from "../../src/abis/VKINABI.json" assert { type: "json" };
import VQLE_ABI from "../../src/abis/VQLEABI.json" assert { type: "json" };

const provider = new ethers.JsonRpcProvider(RPC_URL);

const delay = ms => new Promise(r => setTimeout(r, ms));

export async function fetchOwnedTokenIds(contract, wallet, collection) {
  console.log("fetchOwnedTokenIds called:", { wallet, collection });

  const tokenIds = [];

  if (collection !== "VKIN" && collection !== "VQLE") {
    throw new Error(`Unknown collection: ${collection}`);
  }

  if (collection === "VKIN") {
    const balance = Number(await contract.balanceOf(wallet));
    console.log(`VKIN balance: ${balance}`);
    for (let i = 0; i < balance; i++) {
      await delay(200);
      try {
        const tokenId = await contract.tokenOfOwnerByIndex(wallet, i);
        tokenIds.push(tokenId.toString());
      } catch (err) {
        console.warn(`Failed VKIN index ${i}: ${err.message}`);
      }
    }
  } else {
    const MAX_TOKEN_ID = 30;
    console.log(`Scanning VQLE 1 to ${MAX_TOKEN_ID}`);
    for (let t = 1; t <= MAX_TOKEN_ID; t++) {
      await delay(200);
      try {
        const owner = await contract.ownerOf(BigInt(t));
        if (owner.toLowerCase() === wallet.toLowerCase()) {
          tokenIds.push(t.toString());
        }
      } catch {
        continue;
      }
    }
  }

  console.log(`Fetched ${tokenIds.length} ${collection} tokens for ${wallet}`);
  return tokenIds;
}