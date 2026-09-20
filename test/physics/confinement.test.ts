import { describe, it, expect } from "vitest";
import { tauEIPB98y2, tauEITER89P, pLhMartinMW } from "@/lib/physics/confinement";

describe("IPB98(y,2) confinement scaling", () => {
  it("reproduces ITER-like τ_E at ITER parameters", () => {
    // ITER: R=6.2, a=2.0, κ~1.7 (κ_IPB ≈ 1.66), Ip=15 MA, Bt=5.3 T,
    // n̄19=10, PL≈87 MW, ε=0.32, M=2.5 → published τ_E ≈ 3.4-3.7 s
    const tau = tauEIPB98y2({
      IpMA: 15, Bt: 5.3, n19: 10, pLossMW: 87, R0: 6.2,
      kappaIPB: 1.66, epsilon: 0.32, M: 2.5, H98: 1.0,
    });
    expect(tau).toBeGreaterThan(3.0);
    expect(tau).toBeLessThan(4.2);
  });

  it("scales stronger with size than with power", () => {
    const base = tauEIPB98y2({
      IpMA: 10, Bt: 5, n19: 10, pLossMW: 80, R0: 6,
      kappaIPB: 1.7, epsilon: 0.32, M: 2.5, H98: 1,
    });
    const bigger = tauEIPB98y2({
      IpMA: 10, Bt: 5, n19: 10, pLossMW: 80, R0: 12,
      kappaIPB: 1.7, epsilon: 0.32, M: 2.5, H98: 1,
    });
    expect(bigger / base).toBeGreaterThan(3.5); // R^1.97 → ~4x
  });

  it("respects the H98 enhancement factor", () => {
    const a = tauEIPB98y2({
      IpMA: 10, Bt: 5, n19: 10, pLossMW: 80, R0: 6,
      kappaIPB: 1.7, epsilon: 0.32, M: 2.5, H98: 1,
    });
    const b = tauEIPB98y2({
      IpMA: 10, Bt: 5, n19: 10, pLossMW: 80, R0: 6,
      kappaIPB: 1.7, epsilon: 0.32, M: 2.5, H98: 1.15,
    });
    expect(b / a).toBeCloseTo(1.15, 5);
  });
});

describe("ITER89-P L-mode scaling", () => {
  it("gives sub-H-mode confinement for a mid-size machine", () => {
    const tau = tauEITER89P(3, 3.5, 0.6, 10, 3, 1, 1.7, 2.5);
    // JET-ish L-mode: ~0.5-0.9 s
    expect(tau).toBeGreaterThan(0.3);
    expect(tau).toBeLessThan(1.5);
  });
});

describe("Martin L-H threshold", () => {
  it("gives ~95 MW at ITER volume-averaged density (line-avg 0.7e20 → ~50 MW)", () => {
    // Volume-avg n20=1.0 ↔ line-avg ~0.7e20; the published ITER threshold
    // P_LH ≈ 50-60 MW corresponds to the line-averaged density input.
    const p = pLhMartinMW(1.0, 5.3, 2.0, 6.2);
    expect(p).toBeGreaterThan(70);
    expect(p).toBeLessThan(120);
    const pLineAvg = pLhMartinMW(0.7, 5.3, 2.0, 6.2);
    expect(pLineAvg).toBeGreaterThan(40);
    expect(pLineAvg).toBeLessThan(80);
  });
  it("gives <10 MW for a small spherical tokamak", () => {
    const p = pLhMartinMW(0.6, 0.55, 0.685, 0.85);
    expect(p).toBeLessThan(10);
  });
});
