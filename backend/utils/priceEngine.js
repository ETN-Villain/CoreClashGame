// backend/utils/priceEngine.js
import { ethers } from "ethers";
import { TRACKED_TOKENS, PRICING_POOLS, TOKEN_SYMBOL_MAP } from "../swapsConfig.js";

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd";

async function fetchWETNPrice() {
  try {
    const res = await fetch(COINGECKO_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const price = data?.electroneum?.usd;

    if (price && Number.isFinite(price) && price > 0) {
      console.log(`[PriceEngine] Fetched real ETN/WETN price from CoinGecko: $${price}`);
      return price;
    }
  } catch (err) {
    console.warn("[PriceEngine] CoinGecko fetch failed:", err.message);
  }
  return null;
}

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

    const c = new ethers.Contract(tokenAddress, ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], provider);
    const [symbol, decimals] = await Promise.all([
      safeRead(c, "symbol", TOKEN_SYMBOL_MAP[key] || key.slice(0, 8).toUpperCase()),
      safeRead(c, "decimals", 18),
    ]);

    const meta = {
      address: addr(tokenAddress),
      symbol: String(symbol),
      decimals: Number(decimals),
    };
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
        contract = new ethers.Contract(poolAddress, ["function token0() view returns (address)", "function token1() view returns (address)", "function getReserves() view returns (uint112,uint112,uint32)"], provider);
        [token0Addr, token1Addr] = await Promise.all([contract.token0(), contract.token1()]);
      } else if (dex === "ELECTROV3") {
        contract = new ethers.Contract(poolAddress, ["function token0() view returns (address)", "function token1() view returns (address)", "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"], provider);
        [token0Addr, token1Addr] = await Promise.all([contract.token0(), contract.token1()]);
      } else {
        console.warn(`[PriceEngine] Unsupported dex: ${dex}`);
        return;
      }

      const [token0, token1] = await Promise.all([getTokenMeta(token0Addr), getTokenMeta(token1Addr)]);

      pools.push({ address: poolAddress, dex, contract, token0, token1 });
      console.log(`[PriceEngine] Registered pool ${token0.symbol}/${token1.symbol}`);
    } catch (err) {
      console.error(`[PriceEngine] Failed to register pool ${poolAddress}:`, err.message);
    }
  }

  // Register pools
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

      // Fetch real WETN price
      const wetnPrice = await fetchWETNPrice();
      const anchorPrice = wetnPrice ?? 0.00103;   // safe fallback

      // Anchor WETN and stables
      const stableSymbols = new Set(["USDT", "USDC"]);
      for (const [key, meta] of tokenMeta.entries()) {
        const upper = meta.symbol.toUpperCase();
        if (upper === "WETN") {
          nextPrices.set(key, anchorPrice);
        } else if (stableSymbols.has(upper)) {
          nextPrices.set(key, 1.0);
        }
      }

      // Build price edges from pools
      const edges = [];
      for (const pool of pools) {
        try {
          let prices = null;
          if (pool.dex === "UNIV2") {
            const [r0, r1] = await pool.contract.getReserves();
            prices = calcV2PairPrices(r0, r1, pool.token0.decimals, pool.token1.decimals);
          } else if (pool.dex === "ELECTROV3") {
            const slot0 = await pool.contract.slot0();
            prices = calcV3PairPricesFromSqrtPriceX96(slot0[0], pool.token0.decimals, pool.token1.decimals);
          }

          if (prices?.token0InToken1) {
            edges.push({
              t0Key: pool.token0.address.toLowerCase(),
              t1Key: pool.token1.address.toLowerCase(),
              t0InT1: prices.token0InToken1,
              t1InT0: prices.token1InToken0,
            });
          }
        } catch (err) {
          console.warn(`[PriceEngine] Failed reading pool ${pool.address}:`, err.message);
        }
      }

      // Propagate prices
      let changed = true;
      let passes = 0;
      const maxPasses = 15;

      while (changed && passes < maxPasses) {
        changed = false;
        passes++;
        for (const edge of edges) {
          const p0 = nextPrices.get(edge.t0Key);
          const p1 = nextPrices.get(edge.t1Key);

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
        }
      }

      this.pricesUsd = nextPrices;

      console.log(`[PriceEngine] Prices refreshed (WETN = $${anchorPrice.toFixed(6)}, ${passes} passes)`);
      for (const [key, usd] of nextPrices.entries()) {
        const meta = tokenMeta.get(key);
        if (meta) console.log(`  ${meta.symbol.padEnd(8)} → $${usd.toFixed(6)}`);
      }
    },
  };

  await engine.refreshPrices();
  return engine;
}