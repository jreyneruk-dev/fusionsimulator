"use client";

import { useCallback, useEffect, useState } from "react";
import BeePortrait from "@/components/BeePortrait";
import type { StatePayload } from "@/lib/prod/views";

const usd = (n: number, digits = 2) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const pnlColor = (n: number) => (n > 0.005 ? "text-emerald-400" : n < -0.005 ? "text-rose-400" : "text-stone-300");
const STYLE_LABEL: Record<string, string> = { breakout: "Breakout", trend: "Trend", momentum: "Momentum" };

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function Dashboard() {
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((await res.json()) as StatePayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "state unavailable");
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  if (error) {
    return (
      <div className="mt-8 rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
        State unavailable: {error}. Check DATABASE_URL and that the schema is applied (<code>npm run schema</code>).
      </div>
    );
  }
  if (!state) return <div className="mt-8 text-sm text-wax">Loading the hive…</div>;

  const decisions = [...state.decisions].reverse();

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-stone-800 bg-cell p-4 text-sm">
        <span className="rounded bg-hive/20 px-2 py-1 font-bold text-hive">PAPER</span>
        <span>
          Jev today: <strong>{usd(state.jev.usedTodayUsd, 3)}</strong> / {usd(state.jev.capUsd, 2)}
          {state.jev.capped && <em className="ml-1 text-rose-400">capped</em>}
          <span className="ml-2 text-xs text-wax">({state.provider})</span>
        </span>
        <span>
          Costs: fees <strong>{usd(state.costs.fees)}</strong>, spread <strong>{usd(state.costs.spread)}</strong>, funding{" "}
          <strong>{usd(state.costs.funding)}</strong>
        </span>
        <span className={pnlColor(state.totals.pnlPct)}>
          Hive: {usd(state.totals.equity)} ({pct(state.totals.pnlPct)})
        </span>
        <span className="ml-auto text-xs text-wax">updated {timeAgo(state.ts)}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {state.bees.map((bee) => (
          <div key={bee.beeId} className="rounded-xl border border-stone-800 bg-cell p-4">
            <div className="flex items-center gap-3">
              <BeePortrait beeId={bee.beeId} />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{bee.name}</h2>
                  <span className="rounded bg-stone-800 px-1.5 py-0.5 text-xs text-wax">{STYLE_LABEL[bee.style] ?? bee.style}</span>
                  {bee.paused && <span className="rounded bg-stone-700 px-1.5 py-0.5 text-xs">paused</span>}
                  {bee.benched && !bee.paused && <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-xs text-amber-300">benched</span>}
                  {bee.retired && <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-xs text-rose-300">retired</span>}
                </div>
                <p className="text-xs text-wax">{bee.tagline}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-wax">Equity</div>
                <div className="font-semibold">{usd(bee.equity)}</div>
              </div>
              <div>
                <div className="text-xs text-wax">P&L</div>
                <div className={`font-semibold ${pnlColor(bee.pnlPct)}`}>{pct(bee.pnlPct)}</div>
              </div>
              <div>
                <div className="text-xs text-wax">Trades today</div>
                <div className="font-semibold">{bee.tradesToday}</div>
              </div>
              <div>
                <div className="text-xs text-wax">Fee budget left</div>
                <div className="font-semibold">{usd(bee.feeBudgetLeft)}</div>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-stone-900 p-2 text-xs">
              {bee.position ? (
                <>
                  <span className="font-semibold text-hive">
                    {bee.position.side.toUpperCase()} {bee.position.instId.replace("-USDT-SWAP", "")}
                  </span>{" "}
                  {usd(bee.position.notionalUsd, 0)} @ {bee.position.entryPrice}
                </>
              ) : (
                <span className="text-wax">flat — the risk layer decides when that ends</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-stone-800 bg-cell p-4">
          <h3 className="mb-2 font-bold text-hive">Decision stream</h3>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {decisions.map((d, i) => {
              const row = d as Record<string, unknown>;
              return (
                <li key={i} className="flex items-baseline gap-2 rounded bg-stone-900 px-2 py-1.5">
                  <span className="w-14 shrink-0 text-wax">{timeAgo(Number(row.ts) || 0)}</span>
                  <span className="w-12 shrink-0 font-semibold">{String(row.bee_id ?? "")}</span>
                  <span className="font-mono">{String(row.final_action ?? "")}</span>
                  {row.vetoed ? (
                    <span className="ml-auto shrink-0 text-amber-400" title={String(row.veto_reason ?? "")}>
                      vetoed
                    </span>
                  ) : (
                    <span className="ml-auto shrink-0 text-emerald-500">ok</span>
                  )}
                </li>
              );
            })}
            {decisions.length === 0 && <li className="text-wax">No decisions yet — waiting for the first tick.</li>}
          </ul>
        </section>

        <section className="rounded-xl border border-stone-800 bg-cell p-4">
          <h3 className="mb-2 font-bold text-hive">Fills</h3>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {state.fills.map((f, i) => {
              const row = f as Record<string, unknown>;
              const pnl = row.realized_pnl_usd;
              return (
                <li key={i} className="flex items-baseline gap-2 rounded bg-stone-900 px-2 py-1.5">
                  <span className="w-14 shrink-0 text-wax">{timeAgo(Number(row.ts) || 0)}</span>
                  <span className="w-12 shrink-0 font-semibold">{String(row.bee_id ?? "")}</span>
                  <span className="font-mono">
                    {String(row.kind ?? "")} {String(row.inst_id ?? "").replace("-USDT-SWAP", "")} {usd(Number(row.notional_usd ?? 0), 0)}
                  </span>
                  {pnl !== null && pnl !== undefined && (
                    <span className={`ml-auto shrink-0 ${pnlColor(Number(pnl))}`}>{usd(Number(pnl))}</span>
                  )}
                </li>
              );
            })}
            {state.fills.length === 0 && <li className="text-wax">No fills yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
