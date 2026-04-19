// backend/swapListener.js
import { ethers } from "ethers";
import { RPC_URL } from "./config.js";
import { TRACKED_TOKENS } from "./swapsConfig.js";
import { loadLastBlockLocked, saveLastBlockLocked } from "./utils/blockState.js";
import { sendSwapMessage } from "./utils/telegramBot.js";
import { buildPriceEngine } from "./utils/priceEngine.js";

const POLL_INTERVAL_MS = 60000;
const MAX_BLOCK_RANGE = 500;
const REORG_BUFFER_BLOCKS = 2;

const ERC20_MIN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const UNIV2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)"
];

const UNIV3_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"
];

function shortAddr(address) {
  if (!address) return "Unknown";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUnitsSafe(value, decimals) {
  try {
    const num = Number(ethers.formatUnits(value, decimals));
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  } catch {
    return value.toString();
  }
}

async function safeRead(contract, method, fallback) {
  try {
    return await contract[method]();
  } catch {
    return fallback;
  }
}

function getPoolAbi(dex) {
  if (dex === "UNIV2") return UNIV2_PAIR_ABI;
  if (dex === "ELECTROV3") return UNIV3_POOL_ABI;
  throw new Error(`Unsupported dex type: ${dex}`);
}

function getPoolInterface(dex) {
  return new ethers.Interface(getPoolAbi(dex));
}

function getAggregateKey(txHash, tokenAddress) {
  return `${txHash}:${tokenAddress.toLowerCase()}`;
}

function addToAggregate(map, key, fragment) {
  const existing = map.get(key);

  if (!existing) {
    map.set(key, { ...fragment });
    return;
  }

  existing.baseAmountRaw += fragment.baseAmountRaw;
  existing.quoteAmountRaw += fragment.quoteAmountRaw;

  if (fragment.usdValue != null) {
    existing.usdValue = (existing.usdValue || 0) + fragment.usdValue;
  }

  // If quote symbols differ across fragments, mark as multi-hop
  if (existing.quoteSymbol !== fragment.quoteSymbol) {
    existing.quoteSymbol = "MULTI";
  }
}

async function buildRuntimePoolMap(provider) {
  const poolMap = new Map();
  const allWatchedPoolAddresses = new Set();

  for (const tracked of TRACKED_TOKENS) {
    if (!tracked?.address) {
      console.warn(`[SwapListener] Skipping token with missing address: ${tracked?.symbol || "UNKNOWN"}`);
      continue;
    }

    const trackedTokenAddress = ethers.getAddress(tracked.address);
    const trackedFallbackSymbol = tracked.symbol || shortAddr(trackedTokenAddress);

    for (const poolCfg of tracked.pools || []) {
      if (!poolCfg?.address || !poolCfg?.dex) {
        console.warn(`[SwapListener] Skipping invalid pool config for ${trackedFallbackSymbol}`);
        continue;
      }

      const poolAddress = ethers.getAddress(poolCfg.address);
      const abi = getPoolAbi(poolCfg.dex);
      const iface = new ethers.Interface(abi);
      const pool = new ethers.Contract(poolAddress, abi, provider);

      let token0;
      let token1;

      try {
        [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
        token0 = ethers.getAddress(token0);
        token1 = ethers.getAddress(token1);
      } catch (err) {
        console.error(`[SwapListener] Failed loading token0/token1 for pool ${poolAddress}:`, err);
        continue;
      }

if (trackedTokenAddress !== token0 && trackedTokenAddress !== token1) {
  console.warn(
    `[SwapListener] Token ${trackedFallbackSymbol} (${trackedTokenAddress}) is not in pool ${poolAddress}. token0=${token0}, token1=${token1}`
  );
  continue;
}

const baseTokenAddress = trackedTokenAddress;
const quoteTokenAddress = baseTokenAddress === token0 ? token1 : token0;

      const baseTokenContract = new ethers.Contract(baseTokenAddress, ERC20_MIN_ABI, provider);
      const quoteTokenContract = new ethers.Contract(quoteTokenAddress, ERC20_MIN_ABI, provider);

      const [baseSymbol, baseDecimals, quoteSymbol, quoteDecimals] = await Promise.all([
        safeRead(baseTokenContract, "symbol", trackedFallbackSymbol),
        safeRead(baseTokenContract, "decimals", 18),
        safeRead(quoteTokenContract, "symbol", shortAddr(quoteTokenAddress)),
        safeRead(quoteTokenContract, "decimals", 18),
      ]);

      const existing = poolMap.get(poolAddress.toLowerCase()) || {
        poolAddress,
        dex: poolCfg.dex,
        iface,
        pool,
        token0,
        token1,
        trackedTokens: [],
      };

      existing.trackedTokens.push({
        symbol: baseSymbol || trackedFallbackSymbol,
        address: baseTokenAddress,
        decimals: Number(baseDecimals),
        quoteSymbol: quoteSymbol || shortAddr(quoteTokenAddress),
        quoteAddress: quoteTokenAddress,
        quoteDecimals: Number(quoteDecimals),
        trackedIsToken0: baseTokenAddress.toLowerCase() === token0.toLowerCase(),
      });

      poolMap.set(poolAddress.toLowerCase(), existing);
      allWatchedPoolAddresses.add(poolAddress);

      console.log(
        `[SwapListener] Registered ${baseSymbol}/${quoteSymbol} on ${poolCfg.dex} pool ${poolAddress}`
      );
    }
  }

  return {
    poolMap,
    watchedPoolAddresses: [...allWatchedPoolAddresses],
  };
}

function decodeUniv2Swap(parsedArgs, trackedMeta) {
  const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = parsedArgs;

  const trackedIn = trackedMeta.trackedIsToken0 ? BigInt(amount0In) : BigInt(amount1In);
  const trackedOut = trackedMeta.trackedIsToken0 ? BigInt(amount0Out) : BigInt(amount1Out);
  const quoteIn = trackedMeta.trackedIsToken0 ? BigInt(amount1In) : BigInt(amount0In);
  const quoteOut = trackedMeta.trackedIsToken0 ? BigInt(amount1Out) : BigInt(amount0Out);

  if (trackedOut > 0n) {
    return {
      side: "BUY",
      trader: to,
      baseAmountRaw: trackedOut,
      quoteAmountRaw: quoteIn,
    };
  }

  if (trackedIn > 0n) {
    return {
      side: "SELL",
      trader: sender,
      baseAmountRaw: trackedIn,
      quoteAmountRaw: quoteOut,
    };
  }

  return null;
}

function decodeV3Swap(parsedArgs, trackedMeta) {
  const { sender, recipient, amount0, amount1 } = parsedArgs;

  const amt0 = BigInt(amount0);
  const amt1 = BigInt(amount1);

  const trackedDelta = trackedMeta.trackedIsToken0 ? amt0 : amt1;
  const quoteDelta = trackedMeta.trackedIsToken0 ? amt1 : amt0;

  // V3 convention:
  // positive = sent into pool
  // negative = sent out of pool
  if (trackedDelta < 0n) {
    return {
      side: "BUY",
      trader: recipient,
      baseAmountRaw: -trackedDelta,
      quoteAmountRaw: quoteDelta > 0n ? quoteDelta : 0n,
    };
  }

  if (trackedDelta > 0n) {
    return {
      side: "SELL",
      trader: sender,
      baseAmountRaw: trackedDelta,
      quoteAmountRaw: quoteDelta < 0n ? -quoteDelta : 0n,
    };
  }

  return null;
}

function decodeSwap(parsed, poolMeta, trackedMeta) {
  if (poolMeta.dex === "UNIV2") {
    return decodeUniv2Swap(parsed.args, trackedMeta);
  }

  if (poolMeta.dex === "ELECTROV3") {
    return decodeV3Swap(parsed.args, trackedMeta);
  }

  return null;
}

let started = false;

export async function startSwapListener() {
  if (started) return;
  started = true;

  const provider = new ethers.JsonRpcProvider(RPC_URL);

let priceEngine;
try {
  priceEngine = await buildPriceEngine(provider, TRACKED_TOKENS);
} catch (err) {
  console.error("[SwapListener] Failed to initialize price engine:", err);
  throw err;
}

let lastPriceRefreshMs = 0;
const PRICE_REFRESH_MS = 300000; // 5 minutes

  let runtime;
try {
  runtime = await buildRuntimePoolMap(provider);
} catch (err) {
  console.error("[SwapListener] Failed during startup:", err);
  throw err;
}
  const { poolMap, watchedPoolAddresses } = runtime;

  if (!watchedPoolAddresses.length) {
    console.warn("[SwapListener] No valid pools to watch.");
    return;
  }

  let chainTip;
  try {
    chainTip = await provider.getBlockNumber();
  } catch (err) {
    console.error("[SwapListener] Failed to fetch chain tip:", err);
    return;
  }

  let lastBlock = await loadLastBlockLocked();
  if (lastBlock == null) {
    lastBlock = Math.max(0, chainTip - MAX_BLOCK_RANGE);
    await saveLastBlockLocked(lastBlock);
  }

  console.log(
    `[SwapListener] Watching ${watchedPoolAddresses.length} unique pools from block ${lastBlock}`
  );

  // Initial price refresh to populate token metadata
  function estimateSwapUsdValue(priceEngine, trackedMeta, swap) {
  const baseUsd = priceEngine.estimateUsdFromTokenAmount(
    trackedMeta.address,
    swap.baseAmountRaw
  );

  if (baseUsd != null && Number.isFinite(baseUsd) && baseUsd > 0) {
    return baseUsd;
  }

  const quoteUsd = priceEngine.estimateUsdFromTokenAmount(
    trackedMeta.quoteAddress,
    swap.quoteAmountRaw
  );

  if (quoteUsd != null && Number.isFinite(quoteUsd) && quoteUsd > 0) {
    return quoteUsd;
  }

  return null;
}

// Polling Loop
  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      const safeBlock = Math.max(0, currentBlock - REORG_BUFFER_BLOCKS);

      if (safeBlock <= lastBlock) return;

      let fromBlock = lastBlock + 1;

      while (fromBlock <= safeBlock) {
        const toBlock = Math.min(fromBlock + MAX_BLOCK_RANGE - 1, safeBlock);

        console.log(`[SwapListener] Fetching logs ${fromBlock} -> ${toBlock}`);

const aggregatedBuys = new Map();
const txCache = new Map();

for (const poolAddress of watchedPoolAddresses) {
  const poolMeta = poolMap.get(poolAddress.toLowerCase());
  if (!poolMeta) continue;

  let logs = [];
  try {
    const swapTopic = poolMeta.iface.getEvent("Swap").topicHash;

    logs = await provider.getLogs({
      address: poolAddress,
      fromBlock,
      toBlock,
      topics: [swapTopic],
    });
  } catch (err) {
    console.error(`[SwapListener] getLogs failed for pool ${poolAddress}:`, err.message || err);
    continue;
  }

          for (const log of logs) {
            let parsed;
            try {
              parsed = poolMeta.iface.parseLog(log);
              if (!parsed) continue;
            } catch (err) {
              console.error("[SwapListener] Failed to parse log:", err);
              continue;
            }

for (const trackedMeta of poolMeta.trackedTokens) {
  try {
    const swap = decodeSwap(parsed, poolMeta, trackedMeta);
    if (!swap || swap.baseAmountRaw <= 0n) continue;
    if (swap.side !== "BUY") continue;

    let tx;
    if (txCache.has(log.transactionHash)) {
      tx = txCache.get(log.transactionHash);
    } else {
      tx = await provider.getTransaction(log.transactionHash);
      txCache.set(log.transactionHash, tx);
    }

    const buyerAddress = tx?.from || swap.trader;
    const usdValue = estimateSwapUsdValue(priceEngine, trackedMeta, swap);

    const aggregateKey = getAggregateKey(log.transactionHash, trackedMeta.address);

    addToAggregate(aggregatedBuys, aggregateKey, {
      txHash: log.transactionHash,
      symbol: trackedMeta.symbol,
      tokenAddress: trackedMeta.address,
      baseAmountRaw: swap.baseAmountRaw,
      baseDecimals: trackedMeta.decimals,
      quoteAmountRaw: swap.quoteAmountRaw,
      quoteDecimals: trackedMeta.quoteDecimals,
      quoteSymbol: trackedMeta.quoteSymbol,
      trader: buyerAddress,
      usdValue: usdValue ?? null,
    });
  } catch (err) {
    console.error("[SwapListener] Failed processing tracked token swap:", err);
  }
}
          }
        }

for (const aggregated of aggregatedBuys.values()) {
  try {
    console.log(
  `[SwapListener][DEBUG] ${aggregated.symbol} tx=${aggregated.txHash} usdValue=${aggregated.usdValue}`
);
    if (aggregated.usdValue != null && aggregated.usdValue < 1) {
      continue;
    }

    const baseAmount = formatUnitsSafe(
      aggregated.baseAmountRaw,
      aggregated.baseDecimals
    );

    let quoteAmount = null;
    if (aggregated.quoteSymbol !== "MULTI") {
      quoteAmount = formatUnitsSafe(
        aggregated.quoteAmountRaw,
        aggregated.quoteDecimals
      );
    }

    await sendSwapMessage({
      symbol: aggregated.symbol,
      side: "BUY",
      baseAmount,
      quoteAmount: quoteAmount || "-",
      quoteSymbol: aggregated.quoteSymbol === "MULTI" ? "multi-hop" : aggregated.quoteSymbol,
      trader: aggregated.trader,
      txHash: aggregated.txHash,
      usdValue: aggregated.usdValue ?? null,
    });

    console.log(
      `[SwapListener] ${aggregated.symbol} BUY ${baseAmount} in tx ${aggregated.txHash}`
    );
  } catch (err) {
    console.error("[SwapListener] Failed sending aggregated swap message:", err);
  }
}

        lastBlock = toBlock;
        await saveLastBlockLocked(lastBlock);
        fromBlock = toBlock + 1;

        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (err) {
      console.error("[SwapListener] poll error:", err.message || err);
    }

    // Periodically refresh price engine to keep token metadata up to date
    const now = Date.now();
if (now - lastPriceRefreshMs > PRICE_REFRESH_MS) {
  try {
    await priceEngine.refreshPrices();
    lastPriceRefreshMs = now;
  } catch (err) {
    console.error("[SwapListener] Price refresh failed:", err.message || err);
  }
}
  }, POLL_INTERVAL_MS);
}