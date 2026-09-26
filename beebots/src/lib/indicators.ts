/**
 * Pure technical indicators. No dependencies, no I/O.
 * The ensemble score is ported from imikerussell/beebots strategies/BREEZY_BEE.md
 * (Zarattini et al. adaptation: 9 Donchian slices, mirrored short side).
 */

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

export function stdev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

/** Wilder's RSI on a close series. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** MACD line, signal line, histogram on a close series. */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number; signal: number; hist: number } | null {
  if (closes.length < slow + signal) return null;
  const line = ema(closes, fast).map((v, i) => v - ema(closes, slow)[i]);
  const sig = ema(line, signal);
  const i = closes.length - 1;
  return { macd: line[i], signal: sig[i], hist: line[i] - sig[i] };
}

export interface Bollinger {
  middle: number;
  upper: number;
  lower: number;
  /** %B: position of the last close within the bands (0 = lower, 1 = upper) */
  pctB: number;
  bandwidth: number;
}

/** Bollinger bands (20, 2) on typical price or closes. */
export function bollinger(closes: number[], period = 20, mult = 2): Bollinger | null {
  const middle = sma(closes, period);
  const sd = stdev(closes, period);
  if (middle === null || sd === null) return null;
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const last = closes[closes.length - 1];
  const range = upper - lower;
  return {
    middle,
    upper,
    lower,
    pctB: range === 0 ? 0.5 : (last - lower) / range,
    bandwidth: middle === 0 ? 0 : range / middle,
  };
}

/** Wilder's ATR from OHLC bars. */
export function atr(bars: { h: number; l: number; c: number }[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    trs.push(tr);
  }
  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return value;
}

/** %B position of the last close within a Donchian channel (0..100). */
export function donchianPct(bars: { h: number; l: number; c: number }[], period = 20): number | null {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  const hi = Math.max(...slice.map((b) => b.h));
  const lo = Math.min(...slice.map((b) => b.l));
  const last = bars[bars.length - 1].c;
  if (hi === lo) return 50;
  return ((last - lo) / (hi - lo)) * 100;
}

/** Z-score of the last value against a series. */
export function zScore(series: number[]): number | null {
  if (series.length < 8) return null;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
  if (sd === 0) return 0;
  return (series[series.length - 1] - mean) / sd;
}

export const ENSEMBLE_LOOKBACKS = [5, 10, 20, 30, 60, 90, 150, 250, 360] as const;

/**
 * Breezy's ensemble trend score: for each lookback L, the slice is "on" long when
 * the close is above the highest close of the previous L bars, "on" short when
 * below the lowest. Score = (# long slices) - (# short slices), from -9 to +9.
 * Designed for 4h bars; the caller supplies the bar series.
 */
export function ensembleScore(closes: number[]): number | null {
  if (closes.length < 1 + Math.max(...ENSEMBLE_LOOKBACKS)) return null;
  const last = closes[closes.length - 1];
  let long = 0;
  let short = 0;
  for (const l of ENSEMBLE_LOOKBACKS) {
    const prev = closes.slice(closes.length - 1 - l, closes.length - 1);
    if (prev.length !== l) continue;
    if (last > Math.max(...prev)) long++;
    else if (last < Math.min(...prev)) short++;
  }
  return long - short;
}

/** Simple return over `n` bars (fraction, e.g. 0.012 = +1.2%). */
export function returnOverBars(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const then = closes[closes.length - 1 - n];
  if (then === 0) return null;
  return closes[closes.length - 1] / then - 1;
}
