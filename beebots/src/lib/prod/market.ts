/**
 * Market data source for production: owns the indicator cache and its TTL.
 * Tick and read-model are consumers, not owners — all caching policy lives
 * here, in one exported object rather than a module global.
 */

import type { EngineConfig } from "@/lib/config";
import type { MarketData } from "@/lib/types";
import { fullRefresh, tickerPatch, tradableUniverse } from "@/lib/okx/aggregator";
import { loadConfig } from "@/lib/config";

const UNIVERSE_LIMIT = 30; // per-coin indicator fetches per full refresh
const FULL_REFRESH_MS = 5 * 60_000;

export interface MarketSource {
  getMarket(): Promise<MarketData>;
  /** Age of the cached indicator block (ms); diagnostics only. */
  cacheAge(): number | null;
}

/** One source per server instance; the host creates it with the loaded cfg. */
export function createMarketSource(cfg: EngineConfig): MarketSource {
  let cache: { data: MarketData; fetchedAt: number } | null = null;

  return {
    cacheAge() {
      return cache ? Date.now() - cache.fetchedAt : null;
    },

    async getMarket(): Promise<MarketData> {
      const now = Date.now();
      const coins = await tradableUniverse(cfg, UNIVERSE_LIMIT);
      if (cache && now - cache.fetchedAt < FULL_REFRESH_MS) {
        const missing = coins.filter((c) => !cache!.data.byInst[`${c}-USDT-SWAP`]);
        if (missing.length === 0) {
          return await tickerPatch(cache.data);
        }
        const extra = await fullRefresh(missing, cache.data);
        cache = { data: { ts: now, byInst: { ...cache.data.byInst, ...extra.byInst } }, fetchedAt: cache.fetchedAt };
        return await tickerPatch(cache.data);
      }
      const data = await fullRefresh(coins);
      cache = { data, fetchedAt: now };
      return data;
    },
  };
}

/** Host-level singleton: one cache per server process. */
export function defaultMarketSource(): MarketSource {
  return createMarketSource(loadConfig());
}
