/**
 * Engine configuration. Risk defaults are ported from imikerussell/beebots
 * (.env.example + strategies/*.md, MIT). The per-style numbers follow the
 * "live rules since 2026-09-24" headers where they override older knobs.
 */

const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface StyleRisk {
  /** max open+add moves per UTC day (adds/rolls of the same position excluded where noted) */
  maxTradesPerDay: number;
  /** hard daily fee+spread budget in USD */
  feeBudgetUsdDay: number;
  /** spread gate in basis points */
  spreadGateBps: number;
  /** minutes to wait after a close before a new open */
  cooldownMinutes: number;
}

export type JevProviderKind = "ai-gateway" | "openai-compat" | "none";

export interface JevProvider {
  kind: JevProviderKind;
  baseUrl: string;
  /** Memory-only; never logged, never sent anywhere but the provider. */
  apiKey: string | null;
  model: string;
}

export interface EngineConfig {
  startEquityUsd: number;
  maxLeverage: number;
  maxNotionalUsdPerBee: number;
  dailyLossStopPct: number;
  retireAtPct: number;
  min24hVolUsd: number;
  jevDailyUsdCap: number;
  jevTimeoutMs: number;
  /** Resolved provider: this is the only place environment becomes policy. */
  jevProvider: JevProvider;
  /** Base symbols excluded from the tradable universe (crypto-only rule). */
  nonCryptoBlocklist: Set<string>;
  /** OKX public API root (EEA site by default; no keys needed). */
  okxApiBase: string;
  breakout: StyleRisk & { universe: string[] };
  trend: StyleRisk & { universe: string[]; minOpenProb: number; minConvictionIdx: number; minSizeUsd: number; stopAtrMult: number };
  momentum: StyleRisk & { candidates: number; stopAtrMult: number };
}

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

function resolveJevProvider(env: NodeJS.ProcessEnv, fallbackModel: string): JevProvider {
  const gw = env.AI_GATEWAY_API_KEY;
  if (gw) return { kind: "ai-gateway", baseUrl: GATEWAY_BASE, apiKey: gw, model: fallbackModel };
  const base = env.OPENAI_COMPAT_BASE_URL;
  const key = env.OPENAI_COMPAT_API_KEY;
  if (base && key) {
    return { kind: "openai-compat", baseUrl: base.replace(/\/$/, ""), apiKey: key, model: env.OPENAI_COMPAT_MODEL || fallbackModel };
  }
  return { kind: "none", baseUrl: "", apiKey: null, model: fallbackModel };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const jevModel = env.JEV_MODEL || "typesafe-ai/jev";
  return {
    startEquityUsd: num(env.BEE_START_EQUITY_USD, 333),
    maxLeverage: num(env.MAX_LEVERAGE, 2),
    maxNotionalUsdPerBee: num(env.MAX_NOTIONAL_USD_PER_BEE, 700),
    dailyLossStopPct: num(env.DAILY_LOSS_STOP_PCT, 8),
    retireAtPct: num(env.BEE_RETIRE_AT_PCT, 40),
    min24hVolUsd: num(env.MIN_24H_VOL_USD, 1_000_000),
    jevDailyUsdCap: num(env.JEV_DAILY_USD_CAP, 0.2),
    jevTimeoutMs: num(env.JEV_TIMEOUT_MS, 2500),
    jevProvider: resolveJevProvider(env, jevModel),
    okxApiBase: env.OKX_API_BASE || "https://eea.okx.com",
    nonCryptoBlocklist: new Set(
      (env.NON_CRYPTO_BLOCKLIST || "NVDA,OPENAI,ANTHROPIC,XAU,CL,TSLA,META,GOOGL,AMZN,SPY")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
    breakout: {
      universe: (env.BREAKOUT_UNIVERSE || "BTC,ETH,SOL,HYPE").split(",").map((s) => s.trim().toUpperCase()),
      maxTradesPerDay: num(env.BIZZY_MAX_TRADES_PER_DAY, 1),
      feeBudgetUsdDay: num(env.BIZZY_FEE_BUDGET_USD_DAY, 1.0),
      spreadGateBps: num(env.BREAKOUT_SPREAD_GATE_BPS, 5),
      cooldownMinutes: num(env.BIZZY_COOLDOWN_MINUTES, 5),
    },
    trend: {
      universe: (env.TREND_UNIVERSE || "BTC,ETH").split(",").map((s) => s.trim().toUpperCase()),
      maxTradesPerDay: num(env.BREEZY_MAX_TRADES_PER_DAY, 3),
      feeBudgetUsdDay: num(env.BREEZY_FEE_BUDGET_USD_DAY, 1.0),
      spreadGateBps: num(env.TREND_SPREAD_GATE_BPS, 5),
      cooldownMinutes: num(env.BREEZY_COOLDOWN_MINUTES, 240),
      stopAtrMult: num(env.BREEZY_STOP_ATR_MULT, 2),
      minOpenProb: num(env.BREEZY_MIN_OPEN_PROB, 0.7),
      minConvictionIdx: num(env.BREEZY_MIN_CONVICTION_IDX, 2), // "strong" on her 4-step scale
      minSizeUsd: num(env.BREEZY_MIN_SIZE_USD, 10),
    },
    momentum: {
      candidates: num(env.BOOZY_CANDIDATES, 5),
      maxTradesPerDay: num(env.BOOZY_MAX_TRADES_PER_DAY, 3),
      feeBudgetUsdDay: num(env.BOOZY_FEE_BUDGET_USD_DAY, 3.0),
      spreadGateBps: num(env.MOMENTUM_SPREAD_GATE_BPS, 15),
      cooldownMinutes: num(env.BOOZY_COOLDOWN_MINUTES, 2),
      stopAtrMult: num(env.BOOZY_STOP_ATR_MULT, 3),
    },
  };
}
