/**
 * Process-wide singletons shared by the write path (tick) and the read model
 * (views). One market cache per server process — views must share the tick's
 * cache or every dashboard poll would re-pull the full OKX indicator set.
 */

import type { EngineDeps } from "@/lib/engine";
import type { MarketSource } from "@/lib/prod/market";
import { defaultMarketSource } from "@/lib/prod/market";
import { askJev } from "@/lib/jev";

let host: { market: MarketSource; deps: EngineDeps } | null = null;

export function theHost(): { market: MarketSource; deps: EngineDeps } {
  if (!host) {
    host = { market: defaultMarketSource(), deps: { ask: askJev } };
  }
  return host;
}
