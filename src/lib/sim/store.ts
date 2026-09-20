"use client";

/**
 * Central simulation store (zustand).
 * The UI writes params; the worker loop consumes them and pushes
 * SimFrames back at display rate. History is a bounded ring for charts.
 */
import { create } from "zustand";
import type { SimFrame, TokamakParams } from "@/lib/physics/types";
import { PRESETS } from "@/lib/physics/presets";
import {
  DEFAULT_SCENARIO,
  scenarioFactor,
  scaleParams,
  PID,
  type ScenarioPhase,
} from "@/lib/physics/scenario";
import { initialState, step as pbStep } from "@/lib/physics/power-balance";
import type { PlasmaState } from "@/lib/physics/types";

export interface HistoryPoint {
  t: number;
  TkeV: number;
  pFusMW: number;
  Q: number;
  pAuxMW: number;
  betaN: number;
}

export type RunMode = "steady" | "scenario";

interface SimStore {
  params: TokamakParams;
  presetName: string;
  running: boolean;
  speed: number; // simulated seconds per wall second
  mode: RunMode;
  scenario: ScenarioPhase[];
  controllerOn: boolean;
  targetTkeV: number;

  frames: number; // counter to trigger renders
  lastFrame: SimFrame | null;
  history: HistoryPoint[];

  // actions
  setParam<K extends keyof TokamakParams>(key: K, value: TokamakParams[K]): void;
  applyPreset(name: string): void;
  setRunning(run: boolean): void;
  setSpeed(s: number): void;
  setMode(m: RunMode): void;
  setScenario(p: ScenarioPhase[]): void;
  toggleController(): void;
  setTargetTkeV(t: number): void;
  reset(): void;
}

export type { PlasmaState };

const ITER = PRESETS[0].params;

export const useSim = create<SimStore>((set) => ({
  params: { ...ITER },
  presetName: "ITER",
  running: false,
  speed: 4,
  mode: "steady",
  scenario: DEFAULT_SCENARIO,
  controllerOn: false,
  targetTkeV: 12,
  frames: 0,
  lastFrame: null,
  history: [],

  setParam: (key, value) =>
    set((s) => ({ params: { ...s.params, [key]: value }, presetName: "" })),
  applyPreset: (name) =>
    set(() => {
      const preset = PRESETS.find((p) => p.name === name);
      return preset
        ? { params: { ...preset.params }, presetName: name, lastFrame: null, history: [] }
        : {};
    }),
  setRunning: (run) => set({ running: run }),
  setSpeed: (v) => set({ speed: v }),
  setMode: (m) => set({ mode: m, lastFrame: null, history: [] }),
  setScenario: (p) => set({ scenario: p }),
  toggleController: () => set((s) => ({ controllerOn: !s.controllerOn })),
  setTargetTkeV: (t) => set({ targetTkeV: t }),
  reset: () =>
    set((s) => ({
      params: { ...s.params },
      lastFrame: null,
      history: [],
    })),
}));

/**
 * The simulation loop. Runs in the browser (rAF-driven). In SDK/SSR
 * contexts it is never started. We keep it inline rather than a Worker
 * to avoid bundler worker-chunk complexity; the 0-D step is ~2 µs.
 */
export function createSimLoop() {
  let plasmaState: PlasmaState | null = null;
  let lastT: number | null = null;
  let raf = 0;
  let pid = new PID(0.8, 0.25, 0.05, 0, 400);

  const tick = (now: number) => {
    const s = useSim.getState();
    if (!s.running) {
      lastT = null;
      raf = requestAnimationFrame(tick);
      return;
    }
    if (lastT === null) lastT = now;
    const wallDt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;

    // effective params: scenario scaling + controller trim
    let eff = s.params;
    let simDt = wallDt * s.speed;
    if (s.mode === "scenario") {
      const t0 = s.lastFrame?.state.t ?? 0;
      const f = scenarioFactor(s.scenario, t0);
      eff = scaleParams(eff, f);
    }
    if (s.controllerOn && s.lastFrame) {
      const pAuxCmd = pid.update(s.targetTkeV, s.lastFrame.state.TkeV, Math.max(simDt, 1e-3));
      eff = { ...eff, pAuxMW: Math.max(0, Math.min(150, pAuxCmd)) };
    }

    if (!plasmaState) {
      plasmaState = initialState(eff);
    }
    const { state, frame } = pbStep(plasmaState, eff, simDt);
    plasmaState = state;

    // record history at ~20 Hz simulated-independent rate
    const hist = s.history;
    const lastPoint = hist[hist.length - 1];
    if (!lastPoint || state.t - lastPoint.t > 0.05 || hist.length === 0) {
      const point: HistoryPoint = {
        t: state.t,
        TkeV: frame.state.TkeV,
        pFusMW: frame.pFusMW,
        Q: frame.Q,
        pAuxMW: frame.pAuxMW,
        betaN: frame.betaN,
      };
      const nextHist = [...hist, point].slice(-600);
      useSim.setState({
        lastFrame: frame,
        history: nextHist,
        frames: s.frames + 1,
      });
    } else {
      useSim.setState({ lastFrame: frame, frames: s.frames + 1 });
    }

    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
