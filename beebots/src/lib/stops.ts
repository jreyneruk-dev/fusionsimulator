/**
 * Strategy stops: per-style exit rules ported from imikerussell/beebots (MIT).
 * Pure functions — evaluated by the engine each tick for every held position,
 * including benched ones (DRAMA_RULES §2: "only code (stop, time stop, daily
 * loss stop) can close it before the 00:00 UTC reset").
 *
 * Doc sources (strategies/*.md, fetched in this thread):
 *  - BIZZY_BEE.md live rules: "Her stop is back below today's open" and
 *    "She rides it to the UTC day close."
 *  - BREEZY_BEE.md risk: "Stop: 2 x ATR(14) on 4h bars, trailing with the
 *    channel midpoint."
 *  - BOOZY_BEE.md live rules: "Stop and trail at 3 x ATR(1h)" (his own note
 *    approximates the 1h scale; we trail on the 15m ATR the pipeline carries).
 */

import type { BeeAccount, MarketData, StopCheck } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { dayKeyOf } from "@/lib/risk";

/**
 * Per-style exit evaluation for a held position. Returns null while every
 * stop is intact. The trailing anchor is the best favorable price since entry
 * (persisted as Position.bestPrice by the engine), so a trail only tightens.
 */
export function evaluateStops(bee: BeeAccount, market: MarketData, cfg: EngineConfig, now: number = Date.now()): StopCheck | null {
  const p = bee.position;
  if (!p) return null;
  const s = market.byInst[p.instId];
  if (!s) return null;
  const anchor = p.bestPrice ?? p.entryPrice;
  const best = p.side === "long" ? Math.max(anchor, s.last) : Math.min(anchor, s.last);
  const long = p.side === "long";

  if (bee.style === "breakout") {
    // BIZZY_BEE.md live rules: "Her stop is back below today's open".
    if (s.todayOpen !== null && long && s.last < s.todayOpen) {
      return { reason: "breakout_open_stop", detail: `price ${s.last} fell back below today's UTC open ${s.todayOpen}` };
    }
    // BIZZY_BEE.md live rules: "She rides it to the UTC day close." The ride
    // ends once it has crossed a UTC midnight (keyed on entry, independent of
    // the bee's daily counter rollover).
    if (dayKeyOf(now) !== dayKeyOf(p.entryTs)) {
      return { reason: "breakout_day_close", detail: "UTC day rolled over — the breakout ride ends at the day close" };
    }
    return null;
  }

  if (bee.style === "trend") {
    // BREEZY_BEE.md: "Stop: 2 x ATR(14) on 4h bars" (trailing with the channel
    // midpoint — the 4h ATR trail is the code-enforceable core).
    const atrPct = s.atr4hPct ?? s.atrPct;
    if (atrPct === null) return null;
    const dist = (cfg.trend.stopAtrMult * atrPct) / 100;
    const stopPx = long ? best * (1 - dist) : best * (1 + dist);
    if (long ? s.last < stopPx : s.last > stopPx) {
      return { reason: "trend_atr_trail", detail: `${p.side} beyond the ${cfg.trend.stopAtrMult}x 4h-ATR trail (stop ~${stopPx.toFixed(4)} from best ${best.toFixed(4)})` };
    }
    return null;
  }

  // momentum — BOOZY_BEE.md live rules: "Stop and trail at 3 x ATR(1h)",
  // trailed on the 15m ATR the pipeline carries (the tighter of his scales).
  if (s.atrPct === null) return null;
  const dist = (cfg.momentum.stopAtrMult * s.atrPct) / 100;
  const stopPx = long ? best * (1 - dist) : best * (1 + dist);
  if (long ? s.last < stopPx : s.last > stopPx) {
    return { reason: "momentum_atr_trail", detail: `${p.side} beyond the ${cfg.momentum.stopAtrMult}x ATR trail (stop ~${stopPx.toFixed(4)} from best ${best.toFixed(4)})` };
  }
  return null;
}
