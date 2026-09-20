"use client";

import { useSim } from "@/lib/sim/store";
import { PRESETS } from "@/lib/physics/presets";

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
}

const GEOMETRY: SliderDef[] = [
  { key: "R0", label: "Major radius R₀", min: 0.5, max: 10, step: 0.05, unit: "m", hint: "Distance from torus center to plasma center" },
  { key: "a", label: "Minor radius a", min: 0.2, max: 3.5, step: 0.05, unit: "m", hint: "Plasma cross-section radius" },
  { key: "kappa", label: "Elongation κ", min: 1, max: 2.8, step: 0.05, unit: "", hint: "Vertical stretch of the cross-section" },
  { key: "delta", label: "Triangularity δ", min: 0, max: 0.6, step: 0.02, unit: "", hint: "D-shapedness; higher δ improves stability" },
];

const FIELDS: SliderDef[] = [
  { key: "Bt", label: "Toroidal field B_t", min: 0.3, max: 13, step: 0.1, unit: "T", hint: "Main confinement field from the coils" },
  { key: "Ip", label: "Plasma current I_p", min: 0.2, max: 20, step: 0.1, unit: "MA", hint: "Drives the poloidal field; too low → kink" },
];

const PLASMA: SliderDef[] = [
  { key: "n20", label: "Density n̄", min: 0.1, max: 3, step: 0.02, unit: "10²⁰ m⁻³", hint: "Fuel density; Greenwald limit caps this" },
  { key: "pAuxMW", label: "Auxiliary heating", min: 0, max: 150, step: 1, unit: "MW", hint: "External heating (NBI/ECRH/ICRH)" },
  { key: "fAlpha", label: "α confinement", min: 0.5, max: 1, step: 0.01, unit: "", hint: "Fraction of alpha energy retained" },
  { key: "H98", label: "H-factor (H₉₈)", min: 0.7, max: 1.5, step: 0.01, unit: "", hint: "Confinement quality vs empirical scaling" },
  { key: "Zeff", label: "Z_eff (impurities)", min: 1, max: 4, step: 0.05, unit: "", hint: "Effective charge; impurities radiate" },
  { key: "tritiumFraction", label: "Tritium fraction", min: 0, max: 1, step: 0.01, unit: "", hint: "D-T mix; 0.5 is optimal" },
];

function Row({ def }: { def: SliderDef }) {
  const params = useSim((s) => s.params);
  const setParam = useSim((s) => s.setParam);
  const value = params[def.key as keyof typeof params] as number;
  return (
    <label className="block group">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-slate-300">{def.label}</span>
        <span className="font-mono text-[12px] text-cyan-300">
          {value.toFixed(def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0)} {def.unit}
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => setParam(def.key as keyof typeof params, parseFloat(e.target.value))}
      />
      <span className="block text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity h-3">
        {def.hint}
      </span>
    </label>
  );
}

export default function Sliders() {
  const presetName = useSim((s) => s.presetName);
  const applyPreset = useSim((s) => s.applyPreset);
  const params = useSim((s) => s.params);
  const setParam = useSim((s) => s.setParam);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Machine presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p.name)}
              title={p.description}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                presetName === p.name
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Geometry
        </div>
        <div className="flex flex-col gap-1">
          {GEOMETRY.map((d) => (
            <Row key={d.key} def={d} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Magnetic field &amp; current
        </div>
        <div className="flex flex-col gap-1">
          {FIELDS.map((d) => (
            <Row key={d.key} def={d} />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Plasma &amp; heating
        </div>
        <div className="flex flex-col gap-1">
          {PLASMA.map((d) => (
            <Row key={d.key} def={d} />
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          {(["auto", "L", "H"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setParam("regime", r)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                params.regime === r
                  ? "bg-cyan-700 text-cyan-50"
                  : "bg-slate-800/80 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {r === "auto" ? "Regime: auto" : r + "-mode"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
