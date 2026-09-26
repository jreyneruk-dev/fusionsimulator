import type { BeeAccount, JevVerdict, MarketData, MarketSnapshot, MoveMenu, Style } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { loadConfig } from "@/lib/config";

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
    atr4hPct: 0.5,
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
    startEquityUsd: 333,
    realizedPnl: 0,
    feesPaid: 0,
    fundingPaid: 0,
    spreadPaid: 0,
    position: null,
    retired: false,
    paused: false,
    dayKey: new Date(now).toISOString().slice(0, 10),
    dayStartEquityUsd: 333,
    tradesToday: 0,
    feesToday: 0,
    lastCloseTs: null,
    lastFundingTs: null,
    ...over,
  };
}

export function cfg(over: Partial<EngineConfig> = {}): EngineConfig {
  const base = loadConfig({
    BEE_START_EQUITY_USD: "333",
    MIN_24H_VOL_USD: "1000000",
    // Pin the keyless provider so tests never depend on machine env keys.
    AI_GATEWAY_API_KEY: "",
    OPENAI_COMPAT_BASE_URL: "",
  });
  return { ...base, ...over };
}

export function menuOf(beeId: string, style: Style, options: MoveMenu["options"], forced: MoveMenu["forced"] = null): MoveMenu {
  const scales: Record<Style, string[]> = {
    breakout: ["meh", "decent", "juicy", "screaming"],
    trend: ["weak", "fair", "strong", "overwhelming"],
    momentum: ["tipsy", "buzzed", "wasted", "legendary"],
  };
  return { beeId, style, options, convictionScale: scales[style], forced };
}

/** Build a test verdict: choices default to the first menu option at top conviction. */
export function verdict(beeId: string, menu: MoveMenu, over: Partial<JevVerdict> = {}): JevVerdict {
  const choice = over.choice ?? menu.options[0]?.action ?? "WAIT";
  return {
    beeId,
    choice,
    probabilities: { [choice]: 0.9 },
    conviction: menu.convictionScale.length - 1,
    convictionScaleLabel: menu.convictionScale[menu.convictionScale.length - 1],
    provider: "fake",
    inputTokens: 100,
    costUsd: 0,
    latencyMs: 1,
    ...over,
  };
}
