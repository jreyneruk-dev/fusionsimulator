/** Shared domain types for the beebots engine. */

export type Style = "breakout" | "trend" | "momentum";
export type Side = "long" | "short";

export interface Position {
  instId: string;
  side: Side;
  notionalUsd: number;
  entryPrice: number;
  entryTs: number;
  leverage: number;
  /** Best favorable price since entry (ratchet anchor for trailing stops) */
  bestPrice?: number;
}

export interface BeeAccount {
  beeId: string;
  name: string;
  style: Style;
  tagline: string;
  startEquityUsd: number;
  realizedPnl: number;
  feesPaid: number;
  fundingPaid: number;
  spreadPaid: number;
  position: Position | null;
  retired: boolean;
  paused: boolean;
  /** UTC day key (YYYY-MM-DD) the daily counters were last reset on */
  dayKey: string;
  /** Equity snapshot at the last UTC midnight reset (loss-stop anchor) */
  dayStartEquityUsd: number;
  tradesToday: number;
  feesToday: number;
  lastCloseTs: number | null;
  /** Last time funding was accrued for the open position (reset on open) */
  lastFundingTs: number | null;
}

/** Per-coin market snapshot the strategies read (numbers only). */
export interface MarketSnapshot {
  instId: string;
  last: number;
  spreadBps: number;
  vol24hUsd: number;
  r1: number | null;
  r24: number | null;
  r7d: number | null;
  rsi: number | null;
  pctB: number | null;
  atrPct: number | null;
  /** ATR(14) on 4h bars, as % of price (trend stop scale) */
  atr4hPct: number | null;
  ensemble: number | null;
  funding: number | null;
  fundingZ: number | null;
  oiChange1h: number | null;
  volZ: number | null;
  /** UTC 00:00 open of today's daily bar (breakout trigger anchor) */
  todayOpen: number | null;
  /** Yesterday's daily high-low range in price units (breakout trigger width) */
  prevRange: number | null;
  /** Current open interest (contracts), for the 1h OI change */
  oi: number | null;
}

export interface MarketData {
  ts: number;
  byInst: Record<string, MarketSnapshot>;
}

export type MoveKind = "open" | "close" | "hold" | "add" | "flip" | "switch" | "wait";

export interface MoveOption {
  action: string;
  label: string;
  kind: MoveKind;
  instId?: string;
  side?: Side;
  /** fraction of the style's max notional to open (risk layer clamps further) */
  sizeFrac?: number;
}

export interface MoveMenu {
  beeId: string;
  style: Style;
  options: MoveOption[];
  convictionScale: string[];
  /** code-forced move (never-flat rules), applied when Jev's own choice fails gates */
  forced: MoveOption | null;
}

export interface JevVerdict {
  beeId: string;
  choice: string;
  probabilities: Record<string, number>;
  /** Index into the style's conviction scale */
  conviction: number;
  /** The conviction label as returned by the model */
  convictionScaleLabel: string;
  provider: "ai-gateway" | "openai-compat" | "fake" | "none";
  inputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface Decision {
  beeId: string;
  ts: number;
  style: Style;
  verdict: JevVerdict | null;
  finalAction: string;
  finalInstId: string | null;
  finalSide: Side | null;
  sizeUsd: number;
  vetoed: boolean;
  vetoReason: string | null;
}

export interface Fill {
  ts: number;
  beeId: string;
  instId: string;
  side: Side;
  kind: "open" | "add" | "close" | "flip-close" | "flip-open";
  notionalUsd: number;
  price: number;
  feeUsd: number;
  spreadCostUsd: number;
  realizedPnlUsd: number | null;
}

/** Why a code stop closed a held position (ported from strategies/*.md). */
export interface StopCheck {
  reason: "breakout_open_stop" | "breakout_day_close" | "trend_atr_trail" | "momentum_atr_trail";
  detail: string;
}

/** Result of the risk layer for one bee this tick. */
export interface FinalAction {
  action: string;
  kind: MoveKind;
  instId: string | null;
  side: Side | null;
  sizeUsd: number;
  vetoed: boolean;
  vetoReason: string | null;
}
