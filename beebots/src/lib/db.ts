/**
 * Postgres (Supabase free tier) via postgres.js. Pooled connection string.
 * Schema lives in src/lib/schema.sql and is applied by scripts/apply-schema.ts.
 */

import postgres from "postgres";
import type { BeeAccount, Decision, Fill, MarketData } from "@/lib/types";
import { equityOf } from "@/lib/ledger";

let sql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    sql = postgres(url, {
      prepare: false, // required for Supabase/pgBouncer pooled connections
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

const BEE_COLUMNS = `bee_id, name, style, tagline, start_equity_usd, realized_pnl, fees_paid,
  funding_paid, spread_paid, position_json, retired, paused, day_key,
  day_start_equity_usd, trades_today, fees_today, flat_since_ts, last_close_ts,
  last_funding_ts` as const;

export async function upsertBees(bees: BeeAccount[]): Promise<void> {
  const db = getSql();
  for (const b of bees) {
    await db`
      INSERT INTO bees (bee_id, name, style, tagline, start_equity_usd, realized_pnl,
        fees_paid, funding_paid, spread_paid, position_json, retired, paused, day_key,
        day_start_equity_usd, trades_today, fees_today, flat_since_ts, last_close_ts,
        last_funding_ts)
      VALUES (${b.beeId}, ${b.name}, ${b.style}, ${b.tagline}, ${b.startEquityUsd},
        ${b.realizedPnl}, ${b.feesPaid}, ${b.fundingPaid}, ${b.spreadPaid},
        ${b.position ? JSON.stringify(b.position) : null}, ${b.retired}, ${b.paused},
        ${b.dayKey}, ${b.dayStartEquityUsd}, ${b.tradesToday}, ${b.feesToday},
        ${b.flatSinceTs}, ${b.lastCloseTs}, ${b.lastFundingTs})
      ON CONFLICT (bee_id) DO UPDATE SET
        name = EXCLUDED.name, style = EXCLUDED.style, tagline = EXCLUDED.tagline,
        start_equity_usd = EXCLUDED.start_equity_usd, realized_pnl = EXCLUDED.realized_pnl,
        fees_paid = EXCLUDED.fees_paid, funding_paid = EXCLUDED.funding_paid,
        spread_paid = EXCLUDED.spread_paid, position_json = EXCLUDED.position_json,
        retired = EXCLUDED.retired, paused = EXCLUDED.paused, day_key = EXCLUDED.day_key,
        day_start_equity_usd = EXCLUDED.day_start_equity_usd,
        trades_today = EXCLUDED.trades_today, fees_today = EXCLUDED.fees_today,
        flat_since_ts = EXCLUDED.flat_since_ts, last_close_ts = EXCLUDED.last_close_ts,
        last_funding_ts = EXCLUDED.last_funding_ts
    `;
  }
}

export async function loadBees(): Promise<BeeAccount[]> {
  const db = getSql();
  const rows = await db`
    SELECT ${BEE_COLUMNS}
    FROM bees ORDER BY bee_id
  `;
  return rows.map((r: Record<string, unknown>) => ({
    beeId: r.bee_id as string,
    name: r.name as string,
    style: r.style as BeeAccount["style"],
    tagline: r.tagline as string,
    coins: null,
    startEquityUsd: Number(r.start_equity_usd),
    realizedPnl: Number(r.realized_pnl),
    feesPaid: Number(r.fees_paid),
    fundingPaid: Number(r.funding_paid),
    spreadPaid: Number(r.spread_paid),
    position: r.position_json ? (JSON.parse(r.position_json as string) as BeeAccount["position"]) : null,
    retired: Boolean(r.retired),
    paused: Boolean(r.paused),
    dayKey: String(r.day_key),
    dayStartEquityUsd: Number(r.day_start_equity_usd),
    tradesToday: Number(r.trades_today),
    feesToday: Number(r.fees_today),
    flatSinceTs: r.flat_since_ts ? Number(r.flat_since_ts) : null,
    lastCloseTs: r.last_close_ts ? Number(r.last_close_ts) : null,
    lastFundingTs: r.last_funding_ts ? Number(r.last_funding_ts) : null,
  }));
}

export async function insertDecisions(decisions: Decision[]): Promise<void> {
  if (!decisions.length) return;
  const db = getSql();
  await db`
    INSERT INTO decisions ${db(decisions.map((d) => ({
      ts: d.ts,
      bee_id: d.beeId,
      style: d.menu.style,
      chosen: d.verdict?.choice ?? null,
      probabilities: d.verdict ? JSON.stringify(d.verdict.probabilities) : null,
      conviction: d.verdict?.convictionScaleLabel ?? null,
      provider: d.verdict?.provider ?? "none",
      final_action: d.finalAction,
      final_inst_id: d.finalInstId,
      final_side: d.finalSide,
      size_usd: d.sizeUsd,
      vetoed: d.vetoed,
      veto_reason: d.vetoReason,
    })))}
  `;
}

export async function insertFills(fills: Fill[]): Promise<void> {
  if (!fills.length) return;
  const db = getSql();
  await db`
    INSERT INTO fills ${db(fills.map((f) => ({
      ts: f.ts,
      bee_id: f.beeId,
      inst_id: f.instId,
      side: f.side,
      kind: f.kind,
      notional_usd: f.notionalUsd,
      price: f.price,
      fee_usd: f.feeUsd,
      spread_cost_usd: f.spreadCostUsd,
      realized_pnl_usd: f.realizedPnlUsd,
    })))}
  `;
}

export async function recordEquity(bees: BeeAccount[], market: MarketData, ts: number): Promise<void> {
  if (!bees.length) return;
  const db = getSql();
  await db`
    INSERT INTO equity_history ${db(bees.map((b) => ({
      ts,
      bee_id: b.beeId,
      equity_usd: equityOf(b, market),
      fees_paid: b.feesPaid,
      funding_paid: b.fundingPaid,
      spread_paid: b.spreadPaid,
    })))}
  `;
}

export async function jevUsedTodayUsd(now: number): Promise<number> {
  const db = getSql();
  const rows = await db`
    SELECT COALESCE(SUM(cost_usd), 0) AS total FROM decisions
    WHERE ts >= ${new Date(now).setUTCHours(0, 0, 0, 0)}
  `;
  return Number(rows[0]?.total ?? 0);
}

export async function recentDecisions(limit: number): Promise<Record<string, unknown>[]> {
  const db = getSql();
  return await db`
    SELECT ts, bee_id, style, chosen, probabilities, conviction, provider,
           final_action, final_inst_id, final_side, size_usd, vetoed, veto_reason
    FROM decisions ORDER BY ts DESC, bee_id LIMIT ${limit}
  `;
}

export async function recentFills(limit: number): Promise<Record<string, unknown>[]> {
  const db = getSql();
  return await db`
    SELECT ts, bee_id, inst_id, side, kind, notional_usd, price, fee_usd,
           spread_cost_usd, realized_pnl_usd
    FROM fills ORDER BY ts DESC LIMIT ${limit}
  `;
}

export async function pruneOldRows(days: number): Promise<void> {
  const db = getSql();
  const cutoff = Date.now() - days * 86_400_000;
  await db`DELETE FROM decisions WHERE ts < ${cutoff}`;
  await db`DELETE FROM equity_history WHERE ts < ${cutoff}`;
  await db`DELETE FROM fills WHERE ts < ${cutoff}`;
}



export async function lastDecisionTs(): Promise<number | null> {
  const db = getSql();
  const rows = await db`SELECT MAX(ts) AS last_ts FROM decisions`;
  const v = rows[0]?.last_ts;
  return v === null || v === undefined ? null : Number(v);
}

export async function setBeePaused(beeId: string, paused: boolean): Promise<void> {
  const db = getSql();
  await db`UPDATE bees SET paused = ${paused} WHERE bee_id = ${beeId}`;
}
