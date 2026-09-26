/**
 * Paper-trading ledger: fills at real OKX prices with real taker fees,
 * spread costs and funding accrual. Pure functions, unit-tested.
 * Fee/spread model from imikerussell/beebots docs/COSTS.md (MIT):
 *   taker 0.05% per leg; spread cost = spread_bps x notional / 10,000.
 * Funding: X-Perps settle at 00:00, 08:00 and 16:00 UTC.
 */

import type { BeeAccount, Fill, MarketData, Position, Side } from "@/lib/types";

/** OKX X-Perps taker fee, 0.05% per leg (his docs/COSTS.md). Ledger owns fee policy. */
export const TAKER_FEE_RATE = 0.0005;
/** Round-trip fee estimate used against the daily fee budget. */
export const ROUND_TRIP_FEE_RATE = TAKER_FEE_RATE * 2;

export function spreadCostUsd(notional: number, spreadBps: number): number {
  return (notional * spreadBps) / 10_000;
}

export function fundingBoundariesBetween(fromTs: number, toTs: number): number {
  if (toTs <= fromTs) return 0;
  const d = new Date(fromTs);
  d.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (d.getTime() <= toTs) {
    if (d.getTime() > fromTs) count++;
    d.setUTCHours(d.getUTCHours() + 8); // 00:00 -> 08:00 -> 16:00 -> next 00:00 UTC
  }
  return count;
}

/** Funding owed by a position between two timestamps (longs pay positive funding). */
export function fundingDueUsd(p: Position, fundingRate: number, fromTs: number, toTs: number): number {
  const intervals = fundingBoundariesBetween(fromTs, toTs);
  if (intervals <= 0) return 0;
  const dir = p.side === "long" ? 1 : -1;
  return p.notionalUsd * fundingRate * intervals * dir;
}

export function unrealisedPnl(bee: BeeAccount, market: MarketData): number {
  const p = bee.position;
  if (!p) return 0;
  const s = market.byInst[p.instId];
  if (!s) return 0;
  const dir = p.side === "long" ? 1 : -1;
  return ((s.last - p.entryPrice) / p.entryPrice) * p.notionalUsd * dir;
}

export function equityOf(bee: BeeAccount, market: MarketData): number {
  return bee.startEquityUsd + bee.realizedPnl + unrealisedPnl(bee, market) - bee.feesPaid - bee.spreadPaid - bee.fundingPaid;
}

export interface OpenResult {
  bee: BeeAccount;
  fill: Fill;
}

/** Open a new position (or the open leg of a flip, after the close leg). */
export function openPosition(
  bee: BeeAccount,
  instId: string,
  side: Side,
  notionalUsd: number,
  market: MarketData,
  now: number,
  kind: "open" | "flip-open" = "open",
): OpenResult {
  const s = market.byInst[instId];
  const price = s?.last ?? 0;
  const fee = notionalUsd * TAKER_FEE_RATE;
  const spread = spreadCostUsd(notionalUsd, s?.spreadBps ?? 0);
  const position: Position = { instId, side, notionalUsd, entryPrice: price, entryTs: now, leverage: 1 };
  const fill: Fill = { ts: now, beeId: bee.beeId, instId, side, kind, notionalUsd, price, feeUsd: fee, spreadCostUsd: spread, realizedPnlUsd: null };
  return {
    bee: {
      ...bee,
      position,
      feesPaid: bee.feesPaid + fee,
      feesToday: bee.feesToday + fee,
      spreadPaid: bee.spreadPaid + spread,
      flatSinceTs: null,
      lastFundingTs: now,
    },
    fill,
  };
}

/** Add to an existing position at the current mark (weighted entry). */
export function addToPosition(bee: BeeAccount, addUsd: number, market: MarketData, now: number): OpenResult {
  const p = bee.position!;
  const s = market.byInst[p.instId];
  const price = s?.last ?? p.entryPrice;
  const fee = addUsd * TAKER_FEE_RATE;
  const spread = spreadCostUsd(addUsd, s?.spreadBps ?? 0);
  const newNotional = p.notionalUsd + addUsd;
  const avgEntry = (p.entryPrice * p.notionalUsd + price * addUsd) / newNotional;
  const position: Position = { ...p, notionalUsd: newNotional, entryPrice: avgEntry };
  const fill: Fill = { ts: now, beeId: bee.beeId, instId: p.instId, side: p.side, kind: "add", notionalUsd: addUsd, price, feeUsd: fee, spreadCostUsd: spread, realizedPnlUsd: null };
  return {
    bee: { ...bee, position, feesPaid: bee.feesPaid + fee, feesToday: bee.feesToday + fee, spreadPaid: bee.spreadPaid + spread },
    fill,
  };
}

/** Close (fully or partially) the current position at the mark. */
export function closePosition(
  bee: BeeAccount,
  portion: number,
  market: MarketData,
  now: number,
  reason: string | null = null,
): { bee: BeeAccount; fill: Fill; closed: boolean } {
  const p = bee.position!;
  const s = market.byInst[p.instId];
  const price = s?.last ?? p.entryPrice;
  const closeNotional = Math.min(Math.max(portion, 0), 1) * p.notionalUsd;
  const dir = p.side === "long" ? 1 : -1;
  const pnl = ((price - p.entryPrice) / p.entryPrice) * closeNotional * dir;
  const fee = closeNotional * TAKER_FEE_RATE;
  const spread = spreadCostUsd(closeNotional, s?.spreadBps ?? 0);
  const remaining = p.notionalUsd - closeNotional;
  const fully = remaining <= 0.01;
  const position = fully ? null : { ...p, notionalUsd: remaining };
  const fill: Fill = {
    ts: now,
    beeId: bee.beeId,
    instId: p.instId,
    side: p.side === "long" ? "short" : "long",
    kind: reason === "flip" ? "flip-close" : "close",
    notionalUsd: closeNotional,
    price,
    feeUsd: fee,
    spreadCostUsd: spread,
    realizedPnlUsd: pnl,
  };
  return {
    bee: {
      ...bee,
      position,
      realizedPnl: bee.realizedPnl + pnl,
      feesPaid: bee.feesPaid + fee,
      feesToday: bee.feesToday + fee,
      spreadPaid: bee.spreadPaid + spread,
      lastCloseTs: fully ? now : bee.lastCloseTs,
      flatSinceTs: fully ? now : bee.flatSinceTs,
    },
    fill,
    closed: fully,
  };
}
