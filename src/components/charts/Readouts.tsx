"use client";

import { useSim } from "@/lib/sim/store";

function fmt(v: number | undefined, digits = 1, suffix = ""): string {
  if (v === undefined || !isFinite(v)) return "—";
  if (Number.isInteger(v) && digits === 0) return `${v}${suffix}`;
  return `${v.toFixed(digits)}${suffix}`;
}

function BigStat({
  label,
  value,
  sub,
  accent = "cyan",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "amber" | "green" | "rose";
}) {
  const colors = {
    cyan: "text-cyan-300",
    amber: "text-amber-300",
    green: "text-emerald-300",
    rose: "text-rose-300",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono text-xl font-semibold ${colors[accent]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function Readouts() {
  const frame = useSim((s) => s.lastFrame);
  const params = useSim((s) => s.params);
  const T = frame?.state.TkeV;

  const triple = frame ? frame.tripleProduct : undefined;
  const tripleStr =
    triple === undefined
      ? "—"
      : triple >= 1
        ? `${triple.toFixed(1)}×10²⁰`
        : `${(triple ?? 0).toFixed(2)}×10²⁰`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <BigStat
          label="Temperature"
          value={fmt(T, 1, " keV")}
          sub={`${fmt(T ? T * 1.16e7 * 1000 : 0, 0, " K")} ion temperature`}
        />
        <BigStat
          label="Fusion power"
          value={fmt(frame?.pFusMW, 0, " MW")}
          sub={`Q = ${frame && isFinite(frame.Q) ? frame.Q.toFixed(2) : frame ? "∞" : "—"}`}
          accent="amber"
        />
        <BigStat
          label="Confinement τ_E"
          value={fmt(frame?.state.tauE, 2, " s")}
          sub={`${frame?.activeRegime ?? "—"}-mode`}
          accent="green"
        />
        <BigStat
          label="Triple product"
          value={tripleStr}
          sub="n·T·τ_E  (10²⁰ keV·s/m³)"
        />
        <BigStat
          label="Beta"
          value={fmt(frame ? (frame.betaN / Math.max(params.Ip, 0.01)) * params.Ip : undefined, 2, "%")}
          sub={`β_N = ${fmt(frame?.betaN, 2)}`}
        />
        <BigStat
          label="Heating balance"
          value={fmt(
            frame ? frame.pAuxMW + frame.pAlphaNetMW + frame.pOhmMW : undefined,
            0,
            " MW"
          )}
          sub={`α: ${fmt(frame?.pAlphaNetMW, 0)} · aux: ${fmt(frame?.pAuxMW, 0)}`}
        />
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Stability limits
        </div>
        <div className="flex flex-col gap-1.5">
          {(frame?.limits ?? []).map((l) => {
            const color =
              l.severity === "danger"
                ? "border-rose-600 bg-rose-950/40 text-rose-300"
                : l.severity === "warn"
                  ? "border-amber-600 bg-amber-950/30 text-amber-300"
                  : "border-slate-800 bg-slate-900/60 text-slate-400";
            return (
              <div key={l.name} className={`rounded-md border px-3 py-1.5 ${color}`}>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium">{l.name}</span>
                  <span className="font-mono text-[11px]">{l.detail}</span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-slate-800">
                  <div
                    className={`h-1 rounded-full ${
                      l.severity === "danger"
                        ? "bg-rose-500"
                        : l.severity === "warn"
                          ? "bg-amber-500"
                          : "bg-cyan-600"
                    }`}
                    style={{ width: `${Math.min(l.ratio * 100, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          {!frame && (
            <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-[12px] text-slate-500">
              Press ▶ Run to start the pulse
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
