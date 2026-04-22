import { ethers } from "ethers";
import { RPC_URL } from "./config.js";
import { NFT_COLLECTION_MAP } from "./nftConfig.js";
import { loadLastBlockLocked, saveLastBlockLocked } from "./utils/blockState.js";
import { sendTelegramNftSale } from "./utils/telegramBot.js";

const provider = new ethers.JsonRpcProvider(RPC_URL);

const SEAPORT_ADDRESS = "0x678748317e7fD5B7699D07e666087608B401cbFd".toLowerCase();

const POLL_INTERVAL_MS = 60000;
const MAX_BLOCK_RANGE = 500;
const REORG_BUFFER_BLOCKS = 2;

const SEAPORT_ABI = [
  "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, tuple(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer, tuple(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)"
];

const iface = new ethers.Interface(SEAPORT_ABI);
const ORDER_FULFILLED_TOPIC = ethers.id(
  "OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])"
);

const ITEM_TYPE_NATIVE = 0;
const ITEM_TYPE_ERC20 = 1;
const ITEM_TYPE_ERC721 = 2;

function findTrackedErc721OfferItem(items) {
  for (const item of items || []) {
    if (Number(item.itemType) !== ITEM_TYPE_ERC721) continue;

    const token = String(item.token).toLowerCase();
    if (NFT_COLLECTION_MAP[token]) {
      return item;
    }
  }
  return null;
}

function sumNativeOrErc20Consideration(consideration) {
  let total = 0n;
  let symbol = "ETN";

  for (const item of consideration || []) {
    const itemType = Number(item.itemType);

    if (itemType === ITEM_TYPE_NATIVE || itemType === ITEM_TYPE_ERC20) {
      total += BigInt(item.amount);
    }
  }

  return {
    amountRaw: total,
    symbol,
  };
}

export async function startNftMarketplaceListener() {
  async function poll() {
    try {
      const latest = await provider.getBlockNumber();
      let fromBlock = await loadLastBlockLocked("nft_market");

      if (!fromBlock || fromBlock <= 0) {
        fromBlock = Math.max(0, latest - 100);
      }

      fromBlock = Math.max(0, fromBlock - REORG_BUFFER_BLOCKS);
      const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE, latest);

      if (toBlock < fromBlock) return;

      const logs = await provider.getLogs({
        address: SEAPORT_ADDRESS,
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        try {
          const topic0 = log.topics?.[0];
          if (!topic0) continue;

          // SALES
          if (topic0 === ORDER_FULFILLED_TOPIC) {
            const parsed = iface.parseLog(log);
            const seller = String(parsed.args.offerer).toLowerCase();
            const buyer = String(parsed.args.recipient).toLowerCase();

            const nftItem = findTrackedErc721OfferItem(parsed.args.offer);
            if (!nftItem) continue;

            const contractAddress = String(nftItem.token).toLowerCase();
            const collection = NFT_COLLECTION_MAP[contractAddress];
            if (!collection) continue;

            const tokenId = String(nftItem.identifier);
            const { amountRaw, symbol } = sumNativeOrErc20Consideration(parsed.args.consideration);

            await sendTelegramNftSale({
              collectionName: collection.name,
              contractAddress,
              tokenId,
              seller,
              buyer,
              price: ethers.formatEther(amountRaw),
              currencySymbol: symbol,
              txHash: log.transactionHash,
            });
          }
        } catch (err) {
          console.error("[NFT MARKET] Failed processing log:", err);
        }
      }

      await saveLastBlockLocked("nft_market", toBlock + 1);
    } catch (err) {
      console.error("[NFT MARKET] Poll failed:", err);
    }
  }

  await poll();
  setInterval(poll, POLL_INTERVAL_MS);
}