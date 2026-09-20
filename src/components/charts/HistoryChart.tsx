"use client";

import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";

/**
 * Lightweight SVG time-series chart (no chart lib needed at this size).
 * Draws temperature and fusion power history on shared time axis.
 */
export default function HistoryChart() {
  const history = useSim((s) => s.history);

  const chart = useMemo(() => {
    if (history.length < 2) return null;
    const W = 560;
    const H = 150;
    const t0 = history[0].t;
    const t1 = history[history.length - 1].t;
    const span = Math.max(t1 - t0, 1e-3);
    const maxT = Math.max(...history.map((h) => h.TkeV), 1);
    const maxP = Math.max(...history.map((h) => h.pFusMW), 1);
    const x = (t: number) => ((t - t0) / span) * W;
    const yT = (v: number) => H - (v / maxT) * (H - 8) - 4;
    const yP = (v: number) => H - (v / maxP) * (H - 8) - 4;
    const pathT = history.map((h, i) => `${i ? "L" : "M"}${x(h.t).toFixed(1)},${yT(h.TkeV).toFixed(1)}`).join(" ");
    const pathP = history.map((h, i) => `${i ? "L" : "M"}${x(h.t).toFixed(1)},${yP(h.pFusMW).toFixed(1)}`).join(" ");
    return { W, H, pathT, pathP, maxT, maxP, t1 };
  }, [history]);

  if (!chart) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[12px] text-slate-500">
        Time traces appear while the simulation runs.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-1 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-cyan-400" /> T [keV] · max {chart.maxT.toFixed(1)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-amber-400" /> P_fus [MW] · max {chart.maxP.toFixed(0)}
        </span>
        <span className="ml-auto">t = {chart.t1.toFixed(1)} s</span>
      </div>
      <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="h-36 w-full">
        <path d={chart.pathP} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
        <path d={chart.pathT} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
