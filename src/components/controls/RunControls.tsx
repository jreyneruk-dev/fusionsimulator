"use client";

import { useSim } from "@/lib/sim/store";

export default function RunControls() {
  const running = useSim((s) => s.running);
  const setRunning = useSim((s) => s.setRunning);
  const speed = useSim((s) => s.speed);
  const setSpeed = useSim((s) => s.setSpeed);
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  const reset = useSim((s) => s.reset);
  const controllerOn = useSim((s) => s.controllerOn);
  const toggleController = useSim((s) => s.toggleController);
  const targetTkeV = useSim((s) => s.targetTkeV);
  const setTargetTkeV = useSim((s) => s.setTargetTkeV);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <button
        onClick={() => setRunning(!running)}
        className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
          running
            ? "bg-rose-700 hover:bg-rose-600 text-white"
            : "bg-emerald-600 hover:bg-emerald-500 text-white"
        }`}
      >
        {running ? "⏸ Pause" : "▶ Run"}
      </button>
      <button
        onClick={reset}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
      >
        ↺ Reset
      </button>
      <label className="flex items-center gap-2 text-xs text-slate-400">
        Speed
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.5}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="w-24"
        />
        <span className="font-mono text-cyan-300">{speed}×</span>
      </label>
      <div className="flex gap-1">
        {(["steady", "scenario"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded px-2.5 py-1 text-xs capitalize transition-colors ${
              mode === m
                ? "bg-cyan-700 text-cyan-50"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            {m} mode
          </button>
        ))}
      </div>
      <button
        onClick={toggleController}
        className={`rounded px-2.5 py-1 text-xs transition-colors ${
          controllerOn
            ? "bg-fuchsia-700 text-fuchsia-50"
            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
        }`}
      >
        {controllerOn ? "◎ Controller on" : "○ Controller off"}
      </button>
      {controllerOn && (
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Target T
          <input
            type="range"
            min={4}
            max={25}
            step={0.5}
            value={targetTkeV}
            onChange={(e) => setTargetTkeV(parseFloat(e.target.value))}
            className="w-24"
          />
          <span className="font-mono text-fuchsia-300">{targetTkeV.toFixed(1)} keV</span>
        </label>
      )}
    </div>
  );
}
