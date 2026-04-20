// backend/utils/priceEngine.js
import { ethers } from "ethers";
import { TRACKED_TOKENS, PRICING_POOLS, TOKEN_SYMBOL_MAP } from "../swapsConfig.js";

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd";

async function fetchWETNPrice() {
  try {
    const res = await fetch(COINGECKO_API);
    const data = await res.json();
    const price = data?.electroneum?.usd;

    if (price && Number.isFinite(price) && price > 0) {
      console.log(`[PriceEngine] Fetched real WETN/ETN price from CoinGecko: $${price}`);
      return price;
    }
  } catch (err) {
    console.warn("[PriceEngine] Failed to fetch WETN price from CoinGecko:", err.message);
  }
  return null; // fallback if API fails
}

export async function buildPriceEngine(provider, trackedTokens) {
  // ... (keep your existing tokenMeta and pool registration code)

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
      return Number(ethers.formatUnits(rawAmount, meta.decimals)) * usd;
    },

    async refreshPrices() {
      const nextPrices = new Map();

      // 1. Fetch real WETN price + anchor stables
      const wetnPrice = await fetchWETNPrice();
      const anchorPrice = wetnPrice ?? 0.00103; // safe fallback ~ current price

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

      // 2. Read all pool prices (same as before, with error tolerance)
      const edges = [];   // ... keep your existing edge collection code here

      for (const pool of this.pools) {
        // ... (your existing UNIV2 + ELECTROV3 reading logic)
      }

      // 3. Propagate prices through the graph (improved)
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

      console.log(`[PriceEngine] Refreshed prices (WETN anchored at $${anchorPrice.toFixed(6)})`);
      for (const [key, usd] of nextPrices.entries()) {
        const meta = tokenMeta.get(key);
        if (meta) console.log(`  ${meta.symbol.padEnd(8)} → $${usd.toFixed(6)}`);
      }

      return nextPrices;
    },
  };

  await engine.refreshPrices();
  return engine;
}