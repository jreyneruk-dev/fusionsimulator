import type { BeeAccount, MarketData, MarketSnapshot, MoveMenu, Style } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { loadConfig } from "@/lib/config";
import { dayKeyOf } from "@/lib/risk";

export function snapshot(over: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    instId: "BTC-USDT-SWAP",
    last: 100,
    spreadBps: 2,
    vol24hUsd: 5_000_000,
    r1: 0.001,
    r24: 0.02,
    r7d: 0.1,
    rsi: 55,
    pctB: 0.6,
    atrPct: 1.0,
    donchianPct: 70,
    ensemble: 5,
    funding: 0.0001,
    fundingZ: 0.5,
    oiChange1h: 0.01,
    volZ: 1.2,
    todayOpen: 95,
    prevRange: 4,
    oi: 1000,
    ...over,
  };
}

export function market(byInst: Record<string, MarketSnapshot>): MarketData {
  return { ts: Date.now(), byInst };
}

export function bee(over: Partial<BeeAccount> & { beeId: string; style: Style }): BeeAccount {
  const now = Date.now();
  return {
    name: over.beeId,
    tagline: "test bee",
    coins: null,
    startEquityUsd: 333,
    realizedPnl: 0,
    feesPaid: 0,
    fundingPaid: 0,
    spreadPaid: 0,
    position: null,
    retired: false,
    paused: false,
    dayKey: dayKeyOf(now),
    dayStartEquityUsd: 333,
    tradesToday: 0,
    feesToday: 0,
    flatSinceTs: now,
    lastCloseTs: null,
    lastFundingTs: null,
    ...over,
  };
}

export function cfg(over: Partial<EngineConfig> = {}): EngineConfig {
  const base = loadConfig({
    BEE_START_EQUITY_USD: "333",
    MIN_24H_VOL_USD: "1000000",
  });
  return { ...base, ...over };
}

export function menuOf(beeId: string, style: Style, options: MoveMenu["options"], forced: MoveMenu["forced"] = null): MoveMenu {
  const scales: Record<Style, string[]> = {
    breakout: ["meh", "decent", "juicy", "screaming"],
    trend: ["weak", "fair", "strong", "overwhelming"],
    momentum: ["tipsy", "buzzed", "wasted", "legendary"],
  };
  return { beeId, style, options, convictionScale: scales[style], forced, forcedReason: forced ? "test forced" : null };
}
