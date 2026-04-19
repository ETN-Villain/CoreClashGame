// backend/utils/priceEngine.js
import { ethers } from "ethers";

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
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)"
];

function addr(a) {
  return ethers.getAddress(a);
}

async function safeRead(contract, method, fallback) {
  try {
    return await contract[method]();
  } catch {
    return fallback;
  }
}

function formatUsdPrice(n) {
  if (n == null || !Number.isFinite(n)) return "0";

  if (n >= 1) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  if (n >= 0.01) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }

  if (n >= 0.0001) {
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    });
  }

  return n.toLocaleString(undefined, {
    minimumFractionDigits: 8,
    maximumFractionDigits: 10,
  });
}

function toFloat(raw, decimals) {
  return Number(ethers.formatUnits(raw, decimals));
}

// price of token1 in token0 terms? let's return both directions
function calcV2PairPrices(reserve0, reserve1, decimals0, decimals1) {
  const r0 = toFloat(reserve0, decimals0);
  const r1 = toFloat(reserve1, decimals1);

  if (r0 <= 0 || r1 <= 0) {
    return { token0InToken1: null, token1InToken0: null };
  }

  return {
    token0InToken1: r1 / r0, // 1 token0 = X token1
    token1InToken0: r0 / r1, // 1 token1 = X token0
  };
}

function calcV3PairPricesFromSqrtPriceX96(sqrtPriceX96, decimals0, decimals1) {
  const sp = Number(sqrtPriceX96);
  if (!Number.isFinite(sp) || sp <= 0) {
    return { token0InToken1: null, token1InToken0: null };
  }

  // price(token1 per token0) = (sqrtPriceX96^2 / 2^192) * 10^(dec0-dec1)
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
      safeRead(c, "symbol", key.slice(0, 6)),
      safeRead(c, "decimals", 18),
    ]);

    const meta = {
      address: addr(tokenAddress),
      symbol,
      decimals: Number(decimals),
    };

    tokenMeta.set(key, meta);
    return meta;
  }

  for (const tracked of trackedTokens) {
    for (const poolCfg of tracked.pools || []) {
      const poolAddress = addr(poolCfg.address);
      const dex = poolCfg.dex;

      try {
        if (dex === "UNIV2") {
          const pool = new ethers.Contract(poolAddress, UNIV2_PAIR_ABI, provider);
          const [token0Addr, token1Addr] = await Promise.all([pool.token0(), pool.token1()]);
          const token0 = await getTokenMeta(token0Addr);
          const token1 = await getTokenMeta(token1Addr);

          pools.push({
            address: poolAddress,
            dex,
            contract: pool,
            token0,
            token1,
          });
        } else if (dex === "ELECTROV3") {
          const pool = new ethers.Contract(poolAddress, UNIV3_POOL_ABI, provider);
          const [token0Addr, token1Addr] = await Promise.all([pool.token0(), pool.token1()]);
          const token0 = await getTokenMeta(token0Addr);
          const token1 = await getTokenMeta(token1Addr);

          pools.push({
            address: poolAddress,
            dex,
            contract: pool,
            token0,
            token1,
          });
        } else {
          console.warn(`[PriceEngine] Unsupported dex ${dex} for pool ${poolAddress}`);
        }
      } catch (err) {
        console.error(`[PriceEngine] Failed loading pool ${poolAddress}:`, err.message || err);
      }
    }
  }

  const uniquePools = new Map();
  for (const p of pools) uniquePools.set(p.address.toLowerCase(), p);

  const engine = {
    tokenMeta,
    pools: [...uniquePools.values()],
    pricesUsd: new Map(),

    getTokenUsd(tokenAddress) {
      const key = addr(tokenAddress).toLowerCase();
      return this.pricesUsd.get(key) ?? null;
    },

    getTokenUsdBySymbol(symbol) {
      for (const [key, meta] of tokenMeta.entries()) {
        if ((meta.symbol || "").toUpperCase() === String(symbol).toUpperCase()) {
          return this.pricesUsd.get(key) ?? null;
        }
      }
      return null;
    },

    estimateUsdFromTokenAmount(tokenAddress, rawAmount) {
      const key = addr(tokenAddress).toLowerCase();
      const meta = tokenMeta.get(key);
      const usd = this.pricesUsd.get(key);

      if (!meta || usd == null) return null;

      const amount = toFloat(rawAmount, meta.decimals);
      return amount * usd;
    },

    async refreshPrices({
      stableSymbols = ["USDT", "USDC"],
      maxPasses = 5,
    } = {}) {
      const stableSet = new Set(stableSymbols.map((s) => s.toUpperCase()));
      const nextPrices = new Map();

      // 1) Anchor stables at $1
      for (const [key, meta] of tokenMeta.entries()) {
        if (stableSet.has((meta.symbol || "").toUpperCase())) {
          nextPrices.set(key, 1);
        }
      }

      // 2) Read pool-implied prices
      const edges = [];

      for (const pool of this.pools) {
        try {
          if (pool.dex === "UNIV2") {
            const [reserve0, reserve1] = await pool.contract.getReserves();
            const prices = calcV2PairPrices(
              reserve0,
              reserve1,
              pool.token0.decimals,
              pool.token1.decimals
            );

            if (prices.token0InToken1 && prices.token1InToken0) {
              edges.push({
                token0: pool.token0,
                token1: pool.token1,
                token0InToken1: prices.token0InToken1,
                token1InToken0: prices.token1InToken0,
                poolAddress: pool.address,
                dex: pool.dex,
              });
            }
          }

          if (pool.dex === "ELECTROV3") {
            const slot0 = await pool.contract.slot0();
            const sqrtPriceX96 = slot0[0];

            const prices = calcV3PairPricesFromSqrtPriceX96(
              sqrtPriceX96,
              pool.token0.decimals,
              pool.token1.decimals
            );

            if (prices.token0InToken1 && prices.token1InToken0) {
              edges.push({
                token0: pool.token0,
                token1: pool.token1,
                token0InToken1: prices.token0InToken1,
                token1InToken0: prices.token1InToken0,
                poolAddress: pool.address,
                dex: pool.dex,
              });
            }
          }
        } catch (err) {
          console.error(`[PriceEngine] Failed reading price from pool ${pool.address}:`, err.message || err);
        }
      }

      // 3) Propagate USD through the graph
      for (let pass = 0; pass < maxPasses; pass++) {
        let changed = false;

        for (const edge of edges) {
          const t0Key = edge.token0.address.toLowerCase();
          const t1Key = edge.token1.address.toLowerCase();

          const p0 = nextPrices.get(t0Key);
          const p1 = nextPrices.get(t1Key);

          // If token1 USD known, derive token0 USD
          if (p1 != null && p0 == null) {
            const derived = edge.token0InToken1 * p1;
            if (Number.isFinite(derived) && derived > 0) {
              nextPrices.set(t0Key, derived);
              changed = true;
            }
          }

          // If token0 USD known, derive token1 USD
          if (p0 != null && p1 == null) {
            const derived = edge.token1InToken0 * p0;
            if (Number.isFinite(derived) && derived > 0) {
              nextPrices.set(t1Key, derived);
              changed = true;
            }
          }
        }

        if (!changed) break;
      }

      this.pricesUsd = nextPrices;

      console.log("[PriceEngine] Refreshed USD prices:");
      for (const [key, usd] of this.pricesUsd.entries()) {
        const meta = tokenMeta.get(key);
        console.log(`  ${meta?.symbol || key}: $${formatNum(usd)}`);
      }

      return this.pricesUsd;
    },
  };

  await engine.refreshPrices();
  return engine;
}