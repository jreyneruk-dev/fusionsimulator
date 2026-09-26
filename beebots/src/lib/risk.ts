/**
 * The risk layer: plain code that can veto, shrink or force Jev's move.
 * Ported from imikerussell/beebots strategies/DRAMA_RULES.md + strategy docs (MIT).
 * Pure functions only — every cap, gate and forced move is unit-tested both ways.
 *
 * Order of enforcement (mirrors his "check" step):
 *   benched (cap/fee) -> loss stop -> validity -> conviction/probability gates
 *   -> spread/volume gates -> trade cap -> fee budget -> cooldown -> size clamps
 */

import type { BeeAccount, FinalAction, JevVerdict, MarketData, MoveKind, MoveMenu, MoveOption, Side } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { equityOf, ROUND_TRIP_FEE_RATE } from "@/lib/ledger";

/**
 * Bizzy's Z2 funding filter threshold (BIZZY_BEE.md, "Strategy Z2 (filter):
 * funding rate as a veto, not a trigger"; BIS WP 1087 "a high crypto carry
 * predicts future price crashes").
 */
export const FUNDING_Z_BLOCK = 1.5;

/**
 * Z2 funding veto on NEW breakout longs: "block longs when the coin's 30-day
 * funding z > 1.5. Prefer the short side of an upper-band signal when z > 2.
 * Never buy on negative funding alone."
 *
 * When fundingZ is WITHHELD his doc sets no rule, so the veto fails open —
 * the risk layer's other gates and the code stops still apply. The withheld
 * case is visible to Jev and the dashboard through the bee state (fundingZ:
 * null) rather than silently treated as safe.
 */
export function fundingVeto(instId: string, fundingZ: number | null): { vetoed: boolean; reason: string | null } {
  if (fundingZ === null) return { vetoed: false, reason: `fundingZ withheld — Z2 veto cannot run for ${instId}` };
  if (fundingZ > FUNDING_Z_BLOCK) {
    return { vetoed: true, reason: `Z2 funding veto: ${instId} 30-day funding z ${fundingZ.toFixed(2)} > ${FUNDING_Z_BLOCK}` };
  }
  return { vetoed: false, reason: null };
}

export interface Caps {
  tradesLeft: number;
  feeBudgetLeft: number;
  dayPnlPct: number;
  lossStopTripped: boolean;
  retired: boolean;
  benched: boolean;
  inCooldown: boolean;
}

export function dayKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function capsFor(bee: BeeAccount, cfg: EngineConfig, equityNow: number, now: number): Caps {
  const styleCfg = bee.style === "breakout" ? cfg.breakout : bee.style === "trend" ? cfg.trend : cfg.momentum;
  const tradesLeft = styleCfg.maxTradesPerDay - bee.tradesToday;
  const feeBudgetLeft = styleCfg.feeBudgetUsdDay - bee.feesToday;
  const dayStart = bee.dayStartEquityUsd > 0 ? bee.dayStartEquityUsd : bee.startEquityUsd;
  const dayPnlPct = ((equityNow - dayStart) / dayStart) * 100;
  const lossStopTripped = dayPnlPct <= -cfg.dailyLossStopPct;
  const retired = equityNow <= bee.startEquityUsd * (cfg.retireAtPct / 100);
  const benched = tradesLeft <= 0 || feeBudgetLeft <= 0;
  const inCooldown = bee.lastCloseTs !== null && now - bee.lastCloseTs < styleCfg.cooldownMinutes * 60_000;
  return { tradesLeft, feeBudgetLeft, dayPnlPct, lossStopTripped, retired, benched, inCooldown };
}

/**
 * The single "code blocks this move" answer: a positioned bee HOLDs (code
 * rides, stops stay live), a flat bee WAITs. Every vetoed exit returns this —
 * one construction instead of one per gate.
 */
function block(bee: BeeAccount, reason: string): FinalAction {
  return { action: bee.position ? "HOLD" : "WAIT", kind: bee.position ? "hold" : "wait", instId: bee.position?.instId ?? null, side: bee.position?.side ?? null, sizeUsd: 0, vetoed: true, vetoReason: reason };
}

function findOption(menu: MoveMenu, action: string): MoveOption | undefined {
  const needle = action.trim().toUpperCase();
  return menu.options.find((o) => o.action.toUpperCase() === needle);
}

function convictionIndex(verdict: JevVerdict, menu: MoveMenu): number {
  return Math.max(0, menu.convictionScale.indexOf(verdict.convictionScaleLabel ?? "") === -1 ? verdict.conviction : menu.convictionScale.indexOf(verdict.convictionScaleLabel));
}

/**
 * Convert Jev's verdict + menu into the final, code-approved action for one bee.
 * `verdict === null` means benched / Jev unavailable: code rides the position
 * and only forced never-flat entries (where not suspended) can open.
 */
export function applyRisk(
  bee: BeeAccount,
  menu: MoveMenu,
  verdict: JevVerdict | null,
  market: MarketData,
  cfg: EngineConfig,
  now: number = Date.now(),
): FinalAction {
  const equityNow = equityOf(bee, market);
  const caps = capsFor(bee, cfg, equityNow, now);
  const styleCfg = bee.style === "breakout" ? cfg.breakout : bee.style === "trend" ? cfg.trend : cfg.momentum;
  const maxNotional = Math.min(cfg.maxNotionalUsdPerBee, cfg.maxLeverage * equityNow);

  if (caps.retired) return block(bee, "retired: equity below the retirement floor");
  if (caps.lossStopTripped) {
    // Engine closes the position (reduce-only) before this in real flow; here we insist on close.
    if (bee.position) {
      const p = bee.position;
      return { action: "CUT_LOSS", kind: "close", instId: p.instId, side: p.side, sizeUsd: p.notionalUsd, vetoed: true, vetoReason: `daily loss stop tripped (${caps.dayPnlPct.toFixed(1)}%)` };
    }
    return block(bee, `daily loss stop tripped (${caps.dayPnlPct.toFixed(1)}%) — sent home until 00:00 UTC`);
  }

  const openGated = (opt: MoveOption): string | null => {
    if (!opt.instId) return null;
    const s = market.byInst[opt.instId];
    if (!s) return `${opt.instId} has no market data`;
    if (s.vol24hUsd < cfg.min24hVolUsd) return `${opt.instId} fails the $1M volume gate`;
    if (s.spreadBps > styleCfg.spreadGateBps) return `${opt.instId} spread ${s.spreadBps.toFixed(1)}bp > ${styleCfg.spreadGateBps}bp gate`;
    return null;
  };

  const budgetBlocks = (notional: number): string | null => {
    if (notional * ROUND_TRIP_FEE_RATE > caps.feeBudgetLeft) return "fee budget exhausted for today";
    return null;
  };

  // --- No verdict: benched or Jev down. Code rides; forced entries only if allowed.
  if (!verdict) {
    if (bee.position) return block(bee, "benched — code-only management (stops still active)");
    if (menu.forced && !caps.benched) {
      const gate = openGated(menu.forced);
      const sizeUsd = menu.forced.sizeFrac === 0 ? cfg.trend.minSizeUsd : menu.forced.sizeFrac! * maxNotional;
      if (!gate && !budgetBlocks(sizeUsd) && !(menu.forced.sizeFrac! > 0 && caps.inCooldown)) {
        return { action: menu.forced.action, kind: "open", instId: menu.forced.instId ?? null, side: menu.forced.side ?? null, sizeUsd, vetoed: false, vetoReason: null };
      }
      return block(bee, gate ?? "forced entry blocked by gates");
    }
    return block(bee, "benched (cap or fee budget tripped) — forcing suspended");
  }

  // --- Jev chose. Find the option; unknown choices fall back to code.
  const chosen = findOption(menu, verdict.choice);
  if (!chosen) {
    if (menu.forced && !caps.benched) {
      const sizeUsd = menu.forced.sizeFrac === 0 ? cfg.trend.minSizeUsd : menu.forced.sizeFrac! * maxNotional;
      const gate = openGated(menu.forced);
      if (!gate && !budgetBlocks(sizeUsd)) {
        return { action: menu.forced.action, kind: "open", instId: menu.forced.instId ?? null, side: menu.forced.side ?? null, sizeUsd, vetoed: false, vetoReason: `invalid choice "${verdict.choice}" -> forced` };
      }
    }
    return block(bee, `invalid choice "${verdict.choice}"`);
  }

  const opens = (k: MoveKind) => k === "open" || k === "switch" || k === "flip";
  const prob = verdict.probabilities[chosen.action] ?? verdict.probabilities[chosen.action.toUpperCase()] ?? 0;

  // Trend's conviction gate: open/switch only at P >= minOpenProb and conviction >= "strong".
  if (bee.style === "trend" && opens(chosen.kind)) {
    const cIdx = convictionIndex(verdict, menu);
    if (prob < cfg.trend.minOpenProb || cIdx < cfg.trend.minConvictionIdx) {
      if (bee.position) return block(bee, `gate failed: P=${prob.toFixed(2)} conviction=${verdict.convictionScaleLabel ?? verdict.conviction}`);
      if (menu.forced) {
        const sizeUsd = cfg.trend.minSizeUsd;
        const gate = openGated(menu.forced);
        if (!gate && !budgetBlocks(sizeUsd)) {
          return { action: menu.forced.action, kind: "open", instId: menu.forced.instId ?? null, side: menu.forced.side ?? null, sizeUsd, vetoed: false, vetoReason: "gate failed -> forced minimum (never flat)" };
        }
      }
      return block(bee, "gate failed and no forced entry available");
    }
  }

  // Close/hold/trim actions pass straight through.
  if (chosen.kind === "close" || chosen.kind === "hold" || chosen.kind === "wait") {
    const instId = chosen.instId ?? bee.position?.instId ?? null;
    const side = chosen.instId ? chosen.side ?? null : bee.position?.side ?? null;
    const sizeUsd = chosen.kind === "close" && bee.position && instId === bee.position.instId
      ? chosen.action === "TRIM_HALF"
        ? bee.position.notionalUsd / 2
        : bee.position.notionalUsd
      : 0;
    return { action: chosen.action, kind: chosen.kind, instId, side, sizeUsd, vetoed: false, vetoReason: null };
  }

  // Opens / switches / adds: gates, caps, clamps.
  const gateFail = openGated(chosen);
  if (gateFail) return block(bee, gateFail);
  // Z2 funding veto (BIZZY_BEE.md): blocks NEW breakout longs. Adds to the
  // held coin and re-opens of the same long don't change net exposure, so
  // they are exempt — the veto never forces a close (that's the stops' job).
  if (bee.style === "breakout" && chosen.side === "long" && chosen.kind !== "add" && chosen.instId) {
    const sameExposure = bee.position && bee.position.instId === chosen.instId && bee.position.side === "long";
    if (!sameExposure) {
      const veto = fundingVeto(chosen.instId, market.byInst[chosen.instId]?.fundingZ ?? null);
      if (veto.vetoed) return block(bee, veto.reason!);
    }
  }
  if (opens(chosen.kind) && caps.tradesLeft <= 0) {
    return block(bee, `trade cap reached (${bee.tradesToday} today) — riding until 00:00 UTC`);
  }
  if (chosen.kind === "add" && !bee.position) return block(bee, "add with no position");

  let sizeUsd: number;
  if (chosen.sizeFrac === 0 && bee.style === "trend") sizeUsd = cfg.trend.minSizeUsd;
  else sizeUsd = (chosen.sizeFrac ?? 0.5) * maxNotional;

  if (chosen.kind === "add" && bee.position) {
    const room = maxNotional - bee.position.notionalUsd;
    sizeUsd = Math.min(sizeUsd, Math.max(room, 0));
    if (sizeUsd <= 0) return block(bee, "at max notional — nothing to add");
  } else {
    sizeUsd = Math.min(sizeUsd, maxNotional);
    if (sizeUsd < 1) return block(bee, "size rounds to zero");
  }

  const budgetFail = budgetBlocks(sizeUsd);
  if (budgetFail) return block(bee, budgetFail);
  if (opens(chosen.kind) && caps.inCooldown && !(menu.forced && chosen.action === menu.forced.action && chosen.sizeFrac === 0)) {
    return { action: chosen.action, kind: chosen.kind, instId: chosen.instId ?? null, side: chosen.side ?? null, sizeUsd, vetoed: true, vetoReason: `cooldown: ${styleCfg.cooldownMinutes}min after the last close` };
  }

  return { action: chosen.action, kind: chosen.kind, instId: chosen.instId ?? null, side: chosen.side ?? "long", sizeUsd, vetoed: false, vetoReason: null };
}
