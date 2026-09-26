/**
 * The read model: public, read-only dashboard payloads. Contains no keys and
 * no secrets. Held positions are re-marked from the shared market source so
 * unrealised P&L moves between ticks; if the live fetch fails, the last
 * persisted marks are shown instead — visible, not silent.
 */

import type { EngineConfig } from "@/lib/config";
import { loadConfig } from "@/lib/config";
import type { BeeAccount, MarketData } from "@/lib/types";
import { capsFor } from "@/lib/risk";
import { equityOf } from "@/lib/ledger";
import { jevUsedTodayUsd, loadBees, recentDecisions, recentFills } from "@/lib/db";
import { theHost } from "@/lib/prod/host";

export interface StatePayload {
  ts: number;
  mode: "paper";
  provider: string;
  jev: { usedTodayUsd: number; capUsd: number; capped: boolean };
  bees: {
    beeId: string;
    name: string;
    style: string;
    tagline: string;
    equity: number;
    pnlPct: number;
    dayPnlPct: number;
    benched: boolean;
    retired: boolean;
    paused: boolean;
    tradesToday: number;
    feeBudgetLeft: number;
    position: { instId: string; side: string; notionalUsd: number; entryPrice: number; mark: number } | null;
  }[];
  decisions: Record<string, unknown>[];
  fills: Record<string, unknown>[];
  costs: { fees: number; funding: number; spread: number };
  totals: { startEquity: number; equity: number; pnlPct: number };
}

export async function buildState(cfg: EngineConfig = loadConfig()): Promise<StatePayload> {
  const [bees, decisions, fills, used] = await Promise.all([
    loadBees(),
    recentDecisions(40),
    recentFills(20),
    jevUsedTodayUsd(Date.now()),
  ]);

  let live: MarketData | null = null;
  try {
    live = await theHost().market.getMarket();
  } catch (err) {
    console.warn(`[state] live re-mark unavailable (${err instanceof Error ? err.message : String(err)}) — showing last persisted marks`);
  }
  const held: MarketData = { ts: Date.now(), byInst: live?.byInst ?? {} };

  const now = Date.now();
  const beeViews = bees.map((b: BeeAccount) => {
    const equityNow = equityOf(b, held);
    const caps = capsFor(b, cfg, equityNow, now);
    const snap = b.position ? held.byInst[b.position.instId] : undefined;
    const mark = b.position ? (snap?.last ?? b.position.entryPrice) : 0;
    return {
      beeId: b.beeId,
      name: b.name,
      style: b.style,
      tagline: b.tagline,
      equity: equityNow,
      pnlPct: ((equityNow - b.startEquityUsd) / b.startEquityUsd) * 100,
      dayPnlPct: caps.dayPnlPct,
      benched: caps.benched,
      retired: caps.retired,
      paused: b.paused,
      tradesToday: b.tradesToday,
      feeBudgetLeft: Math.max(caps.feeBudgetLeft, 0),
      position: b.position
        ? {
            instId: b.position.instId,
            side: b.position.side,
            notionalUsd: b.position.notionalUsd,
            entryPrice: b.position.entryPrice,
            mark,
          }
        : null,
    };
  });

  const startEquity = bees.reduce((a: number, b: BeeAccount) => a + b.startEquityUsd, 0);
  const equity = beeViews.reduce((a, b) => a + b.equity, 0);
  return {
    ts: now,
    mode: "paper",
    provider: cfg.jevProvider.kind,
    jev: { usedTodayUsd: used, capUsd: cfg.jevDailyUsdCap, capped: used >= cfg.jevDailyUsdCap },
    bees: beeViews,
    decisions,
    fills,
    costs: {
      fees: bees.reduce((a: number, b: BeeAccount) => a + b.feesPaid, 0),
      funding: bees.reduce((a: number, b: BeeAccount) => a + b.fundingPaid, 0),
      spread: bees.reduce((a: number, b: BeeAccount) => a + b.spreadPaid, 0),
    },
    totals: { startEquity, equity, pnlPct: startEquity ? ((equity - startEquity) / startEquity) * 100 : 0 },
  };
}
