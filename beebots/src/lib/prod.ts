/**
 * Production wiring: joins the pure engine to OKX public data and Postgres.
 * "Record, then act" is honoured at the persistence layer: decisions are
 * written before the resulting fills and bee state.
 */

import { loadConfig } from "@/lib/config";
import { runTick } from "@/lib/engine";
import { fullRefresh, tickerPatch, tradableUniverse } from "@/lib/okx/aggregator";
import {
  insertDecisions,
  insertFills,
  jevUsedTodayUsd,
  loadBees,
  pruneOldRows,
  recordEquity,
  seedIfEmpty,
  upsertBees,
} from "@/lib/db";
import { equityOf } from "@/lib/risk";
import type { MarketData } from "@/lib/types";
import type { BeeAccount } from "@/lib/types";

const UNIVERSE_LIMIT = 30; // per-coin indicator fetches per full refresh
const FULL_REFRESH_MS = 5 * 60_000;

let marketCache: { data: MarketData; ts: number; coins: string[] } | null = null;

/** Market data with a 5-minute indicator cache; new coins are fetched on demand. */
export async function getMarket(): Promise<MarketData> {
  const now = Date.now();
  const coins = await tradableUniverse(Number(process.env.MIN_24H_VOL_USD) || 1_000_000, UNIVERSE_LIMIT);
  if (marketCache && now - marketCache.ts < FULL_REFRESH_MS) {
    const missing = coins.filter((c) => !marketCache!.data.byInst[`${c}-USDT-SWAP`]);
    if (missing.length === 0) return await tickerPatch(marketCache.data);
    const extra = await fullRefresh(missing, marketCache.data);
    const merged: MarketData = { ts: now, byInst: { ...marketCache.data.byInst, ...extra.byInst } };
    marketCache = { data: merged, ts: marketCache.ts, coins };
    return await tickerPatch(merged);
  }
  const data = await fullRefresh(coins);
  marketCache = { data, ts: now, coins };
  return data;
}

export function resetMarketCache(): void {
  marketCache = null;
}

export interface TickSummary {
  ok: boolean;
  ts: number;
  decisions: number;
  fills: number;
  jevCostUsd: number;
  jevCapped: boolean;
  provider: string;
  notes: string[];
  error?: string;
}

export async function productionTick(): Promise<TickSummary> {
  const cfg = loadConfig();
  const now = Date.now();
  try {
    const market = await getMarket();
    const bees = await seedIfEmpty(await loadBees(), cfg);
    const used = await jevUsedTodayUsd(now);
    const out = await runTick({ bees, market, cfg, jevUsedTodayUsd: used, now });

    // Record first (decisions), then the resulting state and fills.
    await insertDecisions(out.decisions);
    await insertFills(out.fills);
    await upsertBees(out.bees);
    await recordEquity(out.bees, market, now);
    if (new Date(now).getUTCHours() === 3 && new Date(now).getUTCDate() !== new Date(now - 3_600_000).getUTCDate()) {
      await pruneOldRows(30); // best-effort retention, runs at most once a day
    }

    return {
      ok: true,
      ts: now,
      decisions: out.decisions.length,
      fills: out.fills.length,
      jevCostUsd: out.jevCostUsd,
      jevCapped: out.jevCapped,
      provider: out.provider,
      notes: out.notes,
    };
  } catch (err) {
    return {
      ok: false,
      ts: now,
      decisions: 0,
      fills: 0,
      jevCostUsd: 0,
      jevCapped: false,
      provider: "error",
      notes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Public, read-only dashboard payload. Contains no keys and no secrets. */
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
    position: { instId: string; side: string; notionalUsd: number; entryPrice: number; mark: number; unrealised: number } | null;
  }[];
  decisions: Record<string, unknown>[];
  fills: Record<string, unknown>[];
  costs: { fees: number; funding: number; spread: number };
  totals: { startEquity: number; equity: number; pnlPct: number };
}

export async function buildState(): Promise<StatePayload> {
  const cfg = loadConfig();
  const { loadBees, recentDecisions, recentFills } = await import("@/lib/db");
  const { capsFor } = await import("@/lib/risk");
  const [bees, decisions, fills, used] = await Promise.all([
    loadBees(),
    recentDecisions(40),
    recentFills(20),
    jevUsedTodayUsd(Date.now()),
  ]);
  // Held positions are re-marked from live tickers so unrealised P&L moves
  // between ticks ("held positions move every tick"). If the live fetch fails,
  // the last persisted marks are shown instead — visible, not silent.
  let live: MarketData | null = null;
  try {
    live = await getMarket();
  } catch (err) {
    console.warn(`[state] live re-mark unavailable (${err instanceof Error ? err.message : String(err)}) — showing last persisted marks`);
  }
  const held: MarketData = { ts: Date.now(), byInst: live?.byInst ?? {} };

  const now = Date.now();
  const beeViews = bees.map((b: BeeAccount) => {
    const equityNow = equityOf(b, held);
    const caps = capsFor(b, cfg, equityNow, now);
    const mark = b.position ? (held.byInst[b.position.instId]?.last ?? b.position.entryPrice) : 0;
    const snap = b.position ? held.byInst[b.position.instId] : undefined;
    const unrealised =
      b.position && snap
        ? ((snap.last - b.position.entryPrice) / b.position.entryPrice) * b.position.notionalUsd * (b.position.side === "long" ? 1 : -1)
        : 0;
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
            unrealised,
          }
        : null,
    };
  });
  const startEquity = bees.reduce((a: number, b: BeeAccount) => a + b.startEquityUsd, 0);
  const equity = beeViews.reduce((a, b) => a + b.equity, 0);
  return {
    ts: now,
    mode: "paper",
    provider: (await import("@/lib/jev")).resolveProvider(cfg).kind,
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
