// backend/utils/priceEngine.js
import { ethers } from "ethers";
import { TRACKED_TOKENS, PRICING_POOLS, TOKEN_SYMBOL_MAP } from "../swapsConfig.js";

const ERC20_MIN_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const UNIV2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

const UNIV3_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

function addr(a) {
  return ethers.getAddress(a);
}

async function safeRead(contract, method, fallback) {
  try {
    return await contract[method]();
  } catch (e) {
    console.warn(`[PriceEngine] safeRead ${method} failed:`, e.message);
    return fallback;
  }
}

function toFloat(raw, decimals) {
  try {
    return Number(ethers.formatUnits(raw, decimals));
  } catch {
    return 0;
  }
}

function calcV2PairPrices(reserve0, reserve1, decimals0, decimals1) {
  const r0 = toFloat(reserve0, decimals0);
  const r1 = toFloat(reserve1, decimals1);
  if (r0 <= 0 || r1 <= 0) return { token0InToken1: null, token1InToken0: null };

  return {
    token0InToken1: r1 / r0,
    token1InToken0: r0 / r1,
  };
}

function calcV3PairPricesFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1) {
  const sp = Number(sqrtPriceX96);
  if (!Number.isFinite(sp) || sp <= 0) return { token0InToken1: null, token1InToken0: null };

  const ratio = (sp * sp) / (2 ** 192);
  const decimalAdj = 10 ** (decimals0 - decimals1);
  const token0InToken1 = ratio * decimalAdj;

  if (!Number.isFinite(token0InToken1) || token0InToken1 <= 0) {
    return { token0InToken1: null, token1InToken0: null };
  }

  return {
    token0InToken1,
    token1InToken0: 1 / token0InToken1,
  };
}

export async function buildPriceEngine(provider, trackedTokens) {
  const tokenMeta = new Map();
  const pools = [];

  async function getTokenMeta(tokenAddress) {
    const key = addr(tokenAddress).toLowerCase();
    if (tokenMeta.has(key)) return tokenMeta.get(key);

    const c = new ethers.Contract(tokenAddress, ERC20_MIN_ABI, provider);
    const [symbol, decimals] = await Promise.all([
      safeRead(c, "symbol", TOKEN_SYMBOL_MAP[key] || key.slice(0, 8).toUpperCase()),
      safeRead(c, "decimals", 18),
    ]);

    const meta = { address: addr(tokenAddress), symbol: String(symbol), decimals: Number(decimals) };
    tokenMeta.set(key, meta);
    return meta;
  }

  async function registerPool(poolCfg) {
    if (!poolCfg?.address) return;
    const poolAddress = addr(poolCfg.address);
    const dex = poolCfg.dex;

    try {
      let token0Addr, token1Addr;
      let contract;

      if (dex === "UNIV2") {
        contract = new ethers.Contract(poolAddress, UNIV2_PAIR_ABI, provider);
        [token0Addr, token1Addr] = await Promise.all([contract.token0(), contract.token1()]);
      } else if (dex === "ELECTROV3") {
        contract = new ethers.Contract(poolAddress, UNIV3_POOL_ABI, provider);
        [token0Addr, token1Addr] = await Promise.all([contract.token0(), contract.token1()]);
      } else {
        console.warn(`[PriceEngine] Unsupported dex: ${dex}`);
        return;
      }

      const [token0, token1] = await Promise.all([
        getTokenMeta(token0Addr),
        getTokenMeta(token1Addr),
      ]);

      pools.push({ address: poolAddress, dex, contract, token0, token1 });
      console.log(`[PriceEngine] Registered pool ${token0.symbol}/${token1.symbol} @ ${poolAddress}`);
    } catch (err) {
      console.error(`[PriceEngine] Failed to register pool ${poolAddress}:`, err.message);
    }
  }

  // Register all pools
  for (const tracked of trackedTokens) {
    for (const p of tracked.pools || []) await registerPool(p);
  }
  for (const p of PRICING_POOLS || []) await registerPool(p);

  const engine = {
    tokenMeta,
    pools,
    pricesUsd: new Map(),

    getTokenUsd(tokenAddress) {
      const key = addr(tokenAddress).toLowerCase();
      return this.pricesUsd.get(key) ?? null;
    },

    estimateUsdFromTokenAmount(tokenAddress, rawAmount) {
      const key = addr(tokenAddress).toLowerCase();
      const usd = this.pricesUsd.get(key);
      const meta = tokenMeta.get(key);
      if (!meta || usd == null || usd <= 0) return null;
      return toFloat(rawAmount, meta.decimals) * usd;
    },

    async refreshPrices() {
      const nextPrices = new Map();

      // 1. Anchor stablecoins at $1
      const stables = new Set(["USDT", "USDC", "WETN"]); // add more if needed
      for (const [key, meta] of tokenMeta.entries()) {
        if (stables.has(meta.symbol.toUpperCase())) {
          nextPrices.set(key, 1);
        }
      }

      // 2. Read all pool prices (with better error tolerance)
      const edges = [];

      for (const pool of this.pools) {
        try {
          let prices = null;

          if (pool.dex === "UNIV2") {
            const [reserve0, reserve1] = await pool.contract.getReserves();
            prices = calcV2PairPrices(reserve0, reserve1, pool.token0.decimals, pool.token1.decimals);
          } else if (pool.dex === "ELECTROV3") {
            const slot0 = await pool.contract.slot0();
            prices = calcV3PairPricesFromSqrtPriceX96(
              slot0[0],
              pool.token0.decimals,
              pool.token1.decimals
            );
          }

          if (prices?.token0InToken1 && prices?.token1InToken0) {
            edges.push({
              t0Key: pool.token0.address.toLowerCase(),
              t1Key: pool.token1.address.toLowerCase(),
              t0InT1: prices.token0InToken1,
              t1InT0: prices.token1InToken0,
              poolAddress: pool.address,
            });
          }
        } catch (err) {
          console.warn(`[PriceEngine] Failed reading pool ${pool.address}:`, err.message);
        }
      }

      // 3. Improved propagation (more passes + multiple directions + repeat until stable)
      let changed = true;
      let passes = 0;
      const maxPasses = 12;   // increased

      while (changed && passes < maxPasses) {
        changed = false;
        passes++;

        for (const edge of edges) {
          const p0 = nextPrices.get(edge.t0Key);
          const p1 = nextPrices.get(edge.t1Key);

          // Propagate from known to unknown
          if (p1 != null && p0 == null) {
            const derived = edge.t0InT1 * p1;
            if (Number.isFinite(derived) && derived > 0) {
              nextPrices.set(edge.t0Key, derived);
              changed = true;
            }
          }

          if (p0 != null && p1 == null) {
            const derived = edge.t1InT0 * p0;
            if (Number.isFinite(derived) && derived > 0) {
              nextPrices.set(edge.t1Key, derived);
              changed = true;
            }
          }

          // Also update if both known but one is much better (optional improvement)
        }
      }

      this.pricesUsd = nextPrices;

      console.log(`[PriceEngine] Refreshed prices (${passes} passes):`);
      for (const [key, usd] of nextPrices.entries()) {
        const meta = tokenMeta.get(key);
        if (meta) {
          console.log(`  ${meta.symbol.padEnd(8)} → $${usd.toFixed(6)}`);
        }
      }

      // Warning for tokens that still have no price
      for (const tracked of TRACKED_TOKENS) {
        const key = addr(tracked.address).toLowerCase();
        if (!nextPrices.has(key)) {
          console.warn(`[PriceEngine] WARNING: No USD price for ${tracked.symbol}`);
        }
      }

      return nextPrices;
    },
  };

  await engine.refreshPrices();
  return engine;
}