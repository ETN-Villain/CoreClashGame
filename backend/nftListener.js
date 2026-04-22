import { ethers } from "ethers";
import { RPC_URL } from "./config.js";
import { NFT_COLLECTIONS, NFT_COLLECTION_MAP } from "./nftConfig.js";
import { loadLastBlockLocked, saveLastBlockLocked } from "./utils/blockState.js";
import { sendTelegramNftMint } from "./utils/telegramBot.js";

const POLL_INTERVAL_MS = 60000;
const MAX_BLOCK_RANGE = 500;
const REORG_BUFFER_BLOCKS = 2;

const ERC721_TRANSFER_TOPIC = ethers.id(
  "Transfer(address,address,uint256)"
);

export async function startNftMintListener() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  async function poll() {
    try {
      const latest = await provider.getBlockNumber();
      let fromBlock = await loadLastBlockLocked("nft_mints");

      if (!fromBlock || fromBlock <= 0) {
        fromBlock = latest - 50;
      }

      fromBlock = Math.max(0, fromBlock - REORG_BUFFER_BLOCKS);
      let toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, latest);

      if (toBlock < fromBlock) return;

      const addresses = NFT_COLLECTIONS.map((c) => c.address);

      const logs = await provider.getLogs({
        address: addresses,
        topics: [ERC721_TRANSFER_TOPIC],
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        try {
          const contractAddress = String(log.address).toLowerCase();
          const collection = NFT_COLLECTION_MAP[contractAddress];
          if (!collection) continue;

          const parsed = ethers.Interface.from([
            "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
          ]).parseLog(log);

          const from = String(parsed.args.from).toLowerCase();
          const to = String(parsed.args.to).toLowerCase();
          const tokenId = String(parsed.args.tokenId);

          if (from !== ethers.ZeroAddress.toLowerCase()) continue;

          await sendTelegramNftMint({
            collectionName: collection.name,
            contractAddress,
            tokenId,
            to,
          });
        } catch (err) {
          console.error("[NFT MINT LISTENER] log parse/send failed:", err);
        }
      }

      await saveLastBlockLocked("nft_mints", toBlock + 1);
    } catch (err) {
      console.error("[NFT MINT LISTENER] poll failed:", err);
    }
  }

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}