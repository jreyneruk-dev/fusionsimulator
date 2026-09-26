/**
 * The three trading styles, ported from imikerussell/beebots strategies/*.md (MIT),
 * following the "live rules since 2026-09-24" headers where they override older designs.
 *  - breakout (Bizzy): one Larry Williams volatility breakout a day on BTC/ETH/SOL/HYPE.
 *  - trend (Breezy): ensemble Donchian trend following on BTC/ETH, never flat, vol-sized.
 *  - momentum (Boozy): chases the strongest 7-day mover across the gated universe.
 * Menus only contain moves that are valid right now; Jev picks among real choices.
 */

import type { BeeAccount, MarketData, MarketSnapshot, MoveMenu, MoveOption } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { FUNDING_Z_BLOCK } from "@/lib/risk";

export const CONVICTION_SCALES: Record<string, string[]> = {
  breakout: ["meh", "decent", "juicy", "screaming"],
  trend: ["weak", "fair", "strong", "overwhelming"],
  momentum: ["tipsy", "buzzed", "wasted", "legendary"],
};

const f = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(d)));

function gated(snap: MarketSnapshot, minVol: number, maxSpreadBps: number): boolean {
  return snap.vol24hUsd >= minVol && snap.spreadBps <= maxSpreadBps;
}

// ---------------------------------------------------------------------------
// Breakout (Bizzy live rules): trigger = today's UTC open + 0.5x yesterday's range
// ---------------------------------------------------------------------------

export function breakoutMenu(bee: BeeAccount, market: MarketData, cfg: EngineConfig): MoveMenu {
  const style = "breakout" as const;
  // bee.coins and the style universe hold base symbols ("BTC"); the market map is keyed by instId.
  const universe = cfg.breakout.universe.map((c) => `${c}-USDT-SWAP`);
  const options: MoveOption[] = [];
  if (!bee.position) {
    for (const instId of universe) {
      const s = market.byInst[instId];
      if (!s || s.todayOpen === null || s.prevRange === null) continue;
      const trigger = s.todayOpen + 0.5 * s.prevRange;
      if (s.last <= trigger) continue;
      if (!gated(s, cfg.min24hVolUsd, cfg.breakout.spreadGateBps)) continue;
      // Z2 funding veto at menu level (BIZZY_BEE.md: only offer valid moves):
      // a long whose 30-day funding z > 1.5 is not a valid move right now.
      if (s.fundingZ !== null && s.fundingZ > FUNDING_Z_BLOCK) continue;
      options.push({ action: `LONG_${instId}`, label: `breakout long ${instId}`, kind: "open", instId, side: "long", sizeFrac: 1 });
    }
  } else {
    const p = bee.position;
    const s = market.byInst[p.instId];
    const inProfit = s ? s.last > p.entryPrice === (p.side === "long") : false;
    if (inProfit) options.push({ action: "HOLD_WINNER", label: "ride it to the close", kind: "hold" });
    options.push({ action: "CUT_LOSS", label: "cut it now", kind: "close" });
  }
  return {
    beeId: bee.beeId,
    style,
    options: options.length ? options : [{ action: "WAIT", label: "no valid setup — wait", kind: "wait" }],
    convictionScale: CONVICTION_SCALES.breakout,
    forced: null, // live rules: she is never forced in
  };
}

// ---------------------------------------------------------------------------
// Trend (Breezy)
// ---------------------------------------------------------------------------

export function trendMenu(bee: BeeAccount, market: MarketData, cfg: EngineConfig): MoveMenu {
  const style = "trend" as const;
  const universe = cfg.trend.universe;
  const options: MoveOption[] = [];
  const scored = universe
    .map((c) => ({ coin: c, s: market.byInst[`${c}-USDT-SWAP`] }))
    .filter((x) => x.s && x.s.ensemble !== null)
    .sort((a, b) => Math.abs(b.s!.ensemble!) - Math.abs(a.s!.ensemble!));
  const p = bee.position;
  if (p) {
    const s = market.byInst[p.instId];
    const pnlR = s && s.atrPct ? Math.abs(s.last - p.entryPrice) / Math.max((s.atrPct / 100) * p.entryPrice, 1e-9) : 0;
    if (pnlR > 1) options.push({ action: "ADD_TO_WINNER", label: `add one slice to ${p.instId}`, kind: "add", instId: p.instId, side: p.side, sizeFrac: 0.25 });
    options.push({ action: "HOLD_WINNER", label: `hold the ${p.side} on ${p.instId}`, kind: "hold" });
    options.push({ action: "TRIM_HALF", label: `take half off ${p.instId}`, kind: "close", instId: p.instId });
  }
  for (const { coin, s } of scored) {
    if (p && p.instId === `${coin}-USDT-SWAP`) continue;
    const side = s!.ensemble! >= 0 ? "long" : "short";
    options.push({ action: `${side === "long" ? "LONG" : "SHORT"}_${coin}`, label: `${side} ${coin} (score ${s!.ensemble})`, kind: p ? "switch" : "open", instId: `${coin}-USDT-SWAP`, side, sizeFrac: Math.min(1, Math.max(0.25, Math.abs(s!.ensemble!) / 9)) });
  }
  return {
    beeId: bee.beeId,
    style,
    options: options.length ? options : [{ action: bee.position ? "HOLD_WINNER" : "WAIT", label: "nothing valid right now", kind: bee.position ? "hold" : "wait" }],
    convictionScale: CONVICTION_SCALES.trend,
    // Never flat: if flat and no option, force the minimum size toward the stronger score.
    forced:
      !p && scored.length
        ? {
            action: `${scored[0].s!.ensemble! >= 0 ? "LONG" : "SHORT"}_${scored[0].coin}`,
            label: `forced minimum toward the stronger trend`,
            kind: "open",
            instId: `${scored[0].coin}-USDT-SWAP`,
            side: scored[0].s!.ensemble! >= 0 ? "long" : "short",
            sizeFrac: 0, // risk layer converts to minSizeUsd
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Momentum (Boozy live rules)
// ---------------------------------------------------------------------------

export function momentumScore(s: MarketSnapshot): number {
  const r7 = s.r7d ?? 0;
  const r24 = s.r24 ?? 0;
  const vz = s.volZ ?? 0;
  return r7 + 0.3 * r24 + 0.1 * vz; // 7-day momentum plus small 24h and attention terms
}

export function momentumCandidates(market: MarketData, cfg: EngineConfig): MarketSnapshot[] {
  return Object.values(market.byInst)
    .filter((s) => gated(s, cfg.min24hVolUsd, cfg.momentum.spreadGateBps))
    .sort((a, b) => momentumScore(b) - momentumScore(a))
    .slice(0, Math.max(cfg.momentum.candidates, 5));
}

export function momentumMenu(bee: BeeAccount, market: MarketData, cfg: EngineConfig): MoveMenu {
  const style = "momentum" as const;
  const options: MoveOption[] = [];
  const cands = momentumCandidates(market, cfg);
  const p = bee.position;
  if (p) {
    const s = market.byInst[p.instId];
    const atrPx = s && s.atrPct ? (s.atrPct / 100) * p.entryPrice : p.entryPrice * 0.01;
    const pnlR = s ? (s.last - p.entryPrice) / atrPx * (p.side === "long" ? 1 : -1) : 0;
    if (pnlR > 1 && p.notionalUsd < cfg.maxNotionalUsdPerBee) {
      options.push({ action: "DOUBLE_DOWN", label: `add 0.5x to ${p.instId}`, kind: "add", instId: p.instId, side: p.side, sizeFrac: 0.25 });
    }
    options.push({ action: "RIDE", label: `ride ${p.instId}`, kind: "hold" });
  }
  for (const c of cands.slice(0, cfg.momentum.candidates)) {
    if (p && c.instId === p.instId) continue;
    options.push({ action: `APE_${c.instId}`, label: `ape ${c.instId} (7d ${f(c.r7d === null ? null : c.r7d * 100, 1)}%)`, kind: p ? "switch" : "open", instId: c.instId, side: "long", sizeFrac: 0.5 });
  }
  if (p) {
    options.push({ action: "BAIL", label: `bail on ${p.instId}`, kind: "close", instId: p.instId });
  }
  return {
    beeId: bee.beeId,
    style,
    options: options.length ? options : [{ action: bee.position ? "RIDE" : "WAIT", label: "nothing valid right now", kind: bee.position ? "hold" : "wait" }],
    convictionScale: CONVICTION_SCALES.momentum,
    // Never flat for more than one tick: force APE on the top candidate.
    forced: !p && cands.length
      ? {
          action: `APE_${cands[0].instId}`,
          label: `forced ape on the top candidate ${cands[0].instId}`,
          kind: "open",
          instId: cands[0].instId,
          side: "long",
          sizeFrac: 0.5,
        }
      : null,
  };
}

export function buildMenu(bee: BeeAccount, market: MarketData, cfg: EngineConfig): MoveMenu {
  switch (bee.style) {
    case "breakout":
      return breakoutMenu(bee, market, cfg);
    case "trend":
      return trendMenu(bee, market, cfg);
    case "momentum":
      return momentumMenu(bee, market, cfg);
  }
}
