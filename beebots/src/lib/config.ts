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
  /** stop distance in ATR multiples */
  stopAtrMult: number;
  /** max minutes flat before a forced entry (0 = never forced) */
  maxFlatMinutes: number;
}

export interface EngineConfig {
  tickSeconds: number;
  startEquityUsd: number;
  maxLeverage: number;
  maxNotionalUsdPerBee: number;
  dailyLossStopPct: number;
  retireAtPct: number;
  min24hVolUsd: number;
  jevDailyUsdCap: number;
  jevModel: string;
  jevTimeoutMs: number;
  breakout: StyleRisk & { universe: string[] };
  trend: StyleRisk & { universe: string[]; minOpenProb: number; minConvictionIdx: number; minSizeUsd: number };
  momentum: StyleRisk & { candidates: number; sizeFracLowConviction: number; commitHours: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  return {
    tickSeconds: num(env.TICK_SECONDS, 60),
    startEquityUsd: num(env.BEE_START_EQUITY_USD, 333),
    maxLeverage: num(env.MAX_LEVERAGE, 2),
    maxNotionalUsdPerBee: num(env.MAX_NOTIONAL_USD_PER_BEE, 700),
    dailyLossStopPct: num(env.DAILY_LOSS_STOP_PCT, 8),
    retireAtPct: num(env.BEE_RETIRE_AT_PCT, 40),
    min24hVolUsd: num(env.MIN_24H_VOL_USD, 1_000_000),
    jevDailyUsdCap: num(env.JEV_DAILY_USD_CAP, 0.2),
    jevModel: env.JEV_MODEL || "typesafe-ai/jev",
    jevTimeoutMs: num(env.JEV_TIMEOUT_MS, 2500),
    breakout: {
      universe: (env.BREAKOUT_UNIVERSE || "BTC,ETH,SOL,HYPE").split(",").map((s) => s.trim().toUpperCase()),
      maxTradesPerDay: num(env.BIZZY_MAX_TRADES_PER_DAY, 1),
      feeBudgetUsdDay: num(env.BIZZY_FEE_BUDGET_USD_DAY, 1.0),
      spreadGateBps: num(env.BREAKOUT_SPREAD_GATE_BPS, 5),
      cooldownMinutes: num(env.BIZZY_COOLDOWN_MINUTES, 5),
      stopAtrMult: num(env.BIZZY_STOP_ATR_MULT, 1.5),
      maxFlatMinutes: 0, // live rules: "she is never forced in"
    },
    trend: {
      universe: (env.TREND_UNIVERSE || "BTC,ETH").split(",").map((s) => s.trim().toUpperCase()),
      maxTradesPerDay: num(env.BREEZY_MAX_TRADES_PER_DAY, 3),
      feeBudgetUsdDay: num(env.BREEZY_FEE_BUDGET_USD_DAY, 1.0),
      spreadGateBps: num(env.TREND_SPREAD_GATE_BPS, 5),
      cooldownMinutes: num(env.BREEZY_COOLDOWN_MINUTES, 240),
      stopAtrMult: num(env.BREEZY_STOP_ATR_MULT, 2),
      maxFlatMinutes: 0, // never flat at all: forced minimum position
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
      maxFlatMinutes: 0, // never flat for more than one tick: forced APE
      sizeFracLowConviction: num(env.BOOZY_SIZE_FRACTION, 0.6),
      commitHours: num(env.BOOZY_COMMIT_HOURS, 24),
    },
  };
}
