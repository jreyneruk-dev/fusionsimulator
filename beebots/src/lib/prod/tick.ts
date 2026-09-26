/**
 * The write path: wires the pure engine to the real market source and
 * Postgres, and owns WHEN seeding happens. One production tick = load bees
 * (seed on first run), pull market, run the tick, record decisions first,
 * then fills and bee state.
 */

import { loadConfig } from "@/lib/config";
import type { EngineConfig } from "@/lib/config";
import { runTick } from "@/lib/engine";
import { theHost } from "@/lib/prod/host";
import { BEE_SEEDS } from "@/content/bees";
import { dayKeyOf } from "@/lib/risk";
import type { BeeAccount } from "@/lib/types";
import {
  insertDecisions,
  insertFills,
  jevUsedTodayUsd,
  loadBees,
  pruneOldRows,
  recordEquity,
  upsertBees,
} from "@/lib/db";

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

function seedBees(cfg: EngineConfig, now: number): BeeAccount[] {
  return BEE_SEEDS.map((s) => ({
    beeId: s.beeId,
    name: s.name,
    style: s.style,
    tagline: s.tagline,
    startEquityUsd: cfg.startEquityUsd,
    realizedPnl: 0,
    feesPaid: 0,
    fundingPaid: 0,
    spreadPaid: 0,
    position: null,
    retired: false,
    paused: false,
    dayKey: dayKeyOf(now),
    dayStartEquityUsd: cfg.startEquityUsd,
    tradesToday: 0,
    feesToday: 0,
    lastCloseTs: null,
    lastFundingTs: null,
  }));
}

export async function productionTick(): Promise<TickSummary> {
  const cfg = loadConfig();
  const now = Date.now();
  try {
    // DB config first: fail fast on misconfiguration instead of burning a full
    // OKX market pull (and its rate-limit budget) before discovering it.
    let bees = await loadBees();
    if (bees.length === 0) {
      bees = seedBees(cfg, now);
      await upsertBees(bees);
    }
    const market = await theHost().market.getMarket();
    const used = await jevUsedTodayUsd(now);
    const out = await runTick({ bees, market, cfg, jevUsedTodayUsd: used, now, deps: theHost().deps });

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
