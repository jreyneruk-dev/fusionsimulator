import { describe, it, expect } from "vitest";
import { initialState, step } from "@/lib/physics/power-balance";
import { PRESETS } from "@/lib/physics/presets";
import type { TokamakParams } from "@/lib/physics/types";
import {
  DEFAULT_SCENARIO,
  scenarioFactor,
  scaleParams,
  PID,
} from "@/lib/physics/scenario";

const ITER = PRESETS.find((p) => p.name === "ITER")!.params;

/** Run the sim to steady state and return the last frame. */
function runToSteady(
  params: TokamakParams,
  simSeconds: number,
  dt = 0.05
) {
  let state = initialState(params);
  let last = null as null | ReturnType<typeof step>["frame"];
  const n = Math.round(simSeconds / dt);
  for (let i = 0; i < n; i++) {
    const r = step(state, params, dt);
    state = r.state;
    last = r.frame;
  }
  return { state, frame: last! };
}

describe("0-D power balance: ITER Q≈10 scenario", () => {
  it(
    "reaches steady state with Q in the 5-15 band",
    { timeout: 30_000 },
    () => {
      const { frame } = runToSteady(ITER, 40);
      expect(frame.pFusMW).toBeGreaterThan(200); // hundreds of MW
      expect(frame.pFusMW).toBeLessThan(900);
      expect(frame.Q).toBeGreaterThan(5);
      expect(frame.Q).toBeLessThan(15);
      expect(frame.state.TkeV).toBeGreaterThan(5);
      expect(frame.state.TkeV).toBeLessThan(25);
      // H-mode at ITER operating point
      expect(frame.activeRegime).toBe("H");
    }
  );

  it("energy closes: inputs = losses at steady state", { timeout: 30_000 }, () => {
    const { frame } = runToSteady(ITER, 40);
    const inMW = frame.pAuxMW + frame.pAlphaNetMW + frame.pOhmMW;
    const outMW = frame.pLossMW + frame.pBremMW;
    // within 5% — steady state
    expect(Math.abs(inMW - outMW) / outMW).toBeLessThan(0.05);
  });

  it("tauE from the fixed point satisfies W = P_loss * tauE", { timeout: 30_000 }, () => {
    const { state, frame } = runToSteady(ITER, 40);
    const lhs = state.WJ / 1e6;
    const rhs = frame.pLossMW * frame.state.tauE;
    expect(Math.abs(lhs - rhs) / rhs).toBeLessThan(0.02);
  });

  it("returns to subcritical when heating is switched off", { timeout: 30_000 }, () => {
    const off: TokamakParams = { ...ITER, pAuxMW: 0.01, regime: "H" };
    const { frame } = runToSteady(off, 40);
    // Without heating, alpha heating alone should not hold a hot H-mode
    // plasma at this operating point (Q=∞ territory, but T must collapse
    // or fusion power must be far below the 500 MW level).
    const collapsed = frame.state.TkeV < 6 || frame.pFusMW < 200;
    expect(collapsed).toBe(true);
  });
});

describe("Limit trips in transient", () => {
  it("shows danger when pushed past Greenwald", { timeout: 30_000 }, () => {
    const pushed: TokamakParams = { ...ITER, n20: 1.5, pAuxMW: 80 };
    const { frame } = runToSteady(pushed, 40);
    const gw = frame.limits.find((l) => l.name === "Greenwald density")!;
    expect(gw.severity).not.toBe("ok");
  });
});

describe("Scenario mode", () => {
  it("waveform starts low, holds, ramps down", () => {
    const t0 = scenarioFactor(DEFAULT_SCENARIO, 0);
    const mid = scenarioFactor(DEFAULT_SCENARIO, 10);
    const end = scenarioFactor(DEFAULT_SCENARIO, 43);
    expect(t0).toBeCloseTo(0.2, 1);
    expect(mid).toBe(1.0);
    expect(end).toBeLessThan(0.4);
  });

  it("PID converges toward setpoint", () => {
    const pid = new PID(0.5, 0.2, 0.01, 0, 100);
    let out = 0;
    for (let i = 0; i < 200; i++) out = pid.update(10, out, 0.1);
    expect(out).toBeGreaterThan(9);
    expect(out).toBeLessThan(11);
  });

  it("scaleParams reduces all knobs monotonically", () => {
    const s = scaleParams(ITER, 0.5);
    expect(s.pAuxMW).toBeCloseTo(ITER.pAuxMW * 0.5, 6);
    expect(s.Ip).toBeLessThan(ITER.Ip);
    expect(s.n20).toBeLessThan(ITER.n20);
  });
});
