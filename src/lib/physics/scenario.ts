/**
 * Scenario mode: waveform generator for machine-style pulses
 * (ramp-up → flattop → ramp-down) plus a PID auto-controller that
 * holds a target temperature by trimming auxiliary power.
 */
import type { TokamakParams } from "./types";

export interface ScenarioPhase {
  /** Phase name */
  name: "ramp-up" | "flattop" | "ramp-down";
  /** Duration [s of simulated time] */
  duration: number;
  /** Multiplier on the user's setpoints during this phase (linear ramp) */
  from: number;
  to: number;
}

export const DEFAULT_SCENARIO: ScenarioPhase[] = [
  { name: "ramp-up", duration: 8, from: 0.2, to: 1.0 },
  { name: "flattop", duration: 30, from: 1.0, to: 1.0 },
  { name: "ramp-down", duration: 5, from: 1.0, to: 0.1 },
];

/** Scale the scalar knobs of params by a factor (0..~1.2). */
export function scaleParams(p: TokamakParams, f: number): TokamakParams {
  return {
    ...p,
    pAuxMW: p.pAuxMW * f,
    Ip: Math.max(p.Ip * Math.max(f, 0.1), 0.05),
    n20: Math.max(p.n20 * Math.max(f, 0.15), 0.02),
  };
}

/** Apply the scenario waveform at simulated time t. */
export function scenarioFactor(phases: ScenarioPhase[], t: number): number {
  let acc = 0;
  for (const ph of phases) {
    if (t < acc + ph.duration) {
      const u = (t - acc) / ph.duration;
      return ph.from + (ph.to - ph.from) * u;
    }
    acc += ph.duration;
  }
  return phases[phases.length - 1]?.to ?? 1;
}

/** Simple PID controller on temperature with anti-windup. */
export class PID {
  private integ = 0;
  private prevErr = 0;
  constructor(
    private kp: number,
    private ki: number,
    private kd: number,
    private outMin: number,
    private outMax: number
  ) {}

  /** Returns the controller output for the given error. */
  update(setpoint: number, measured: number, dt: number): number {
    const err = setpoint - measured;
    this.integ += err * dt;
    // anti-windup clamp
    this.integ = Math.max(
      this.outMin / Math.max(this.ki, 1e-9),
      Math.min(this.outMax / Math.max(this.ki, 1e-9), this.integ)
    );
    const deriv = dt > 0 ? (err - this.prevErr) / dt : 0;
    this.prevErr = err;
    const out = this.kp * err + this.ki * this.integ + this.kd * deriv;
    return Math.max(this.outMin, Math.min(this.outMax, out));
  }

  reset(): void {
    this.integ = 0;
    this.prevErr = 0;
  }
}
