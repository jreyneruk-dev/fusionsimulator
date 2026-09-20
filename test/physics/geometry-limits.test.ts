import { describe, it, expect } from "vitest";
import {
  greenwaldDensity,
  betaPercent,
  evaluateLimits,
} from "@/lib/physics/limits";
import {
  plasmaVolume,
  kappaIPB,
  q95,
  millerCrossSection,
} from "@/lib/physics/miller";
import { ohmicPowerMW } from "@/lib/physics/ohmic";
import { parseGeqdsk, fluxContourSegments } from "@/lib/physics/geqdsk";

describe("Miller geometry", () => {
  it("gives ITER plasma volume ≈ 830 m³", () => {
    const V = plasmaVolume({ R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.33 });
    expect(V).toBeGreaterThan(700);
    expect(V).toBeLessThan(900);
  });

  it("kappaIPB ≈ kappa for small triangularity", () => {
    const k = kappaIPB({ R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.1 });
    expect(k).toBeCloseTo(1.7 * (1 - 0.2 * 0.01), 2);
  });

  it("q95 ≈ 3 for ITER-like parameters", () => {
    const q = q95({ R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.33 }, 5.3, 15);
    expect(q).toBeGreaterThan(2.2);
    expect(q).toBeLessThan(4.2);
  });

  it("cross-section is closed and elongated", () => {
    const pts = millerCrossSection({ R0: 6.2, a: 2, kappa: 1.8, delta: 0.4 }, 1, 72);
    expect(pts.length).toBe(72);
    const zs = pts.map((p) => p[1]);
    const height = Math.max(...zs) - Math.min(...zs);
    const width = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    expect(height / width).toBeCloseTo(1.8, 1);
  });
});

describe("Stability limits", () => {
  it("Greenwald density for ITER is ~0.62e20", () => {
    const nGw = greenwaldDensity(15, 2.0);
    expect(nGw).toBeCloseTo(15 / (Math.PI * 4), 2);
  });

  it("beta formula gives ITER-like percent-level values", () => {
    // ITER: n=1e20, T=8 keV, B=5.3 T → β_t ≈ 2.5%, β_N ≈ 1.8
    const b = betaPercent(1.0, 8, 5.3);
    expect(b).toBeGreaterThan(1.5);
    expect(b).toBeLessThan(3.5);
    const betaN = (b * 2.0 * 5.3) / 15;
    expect(betaN).toBeGreaterThan(1.2);
    expect(betaN).toBeLessThan(2.5);
  });

  it("flags danger when Greenwald is exceeded", () => {
    const lims = evaluateLimits(1.0, 4, 5.3, 10, { R0: 6.2, a: 2, kappa: 1.7, delta: 0.3 });
    const gw = lims.find((l) => l.name === "Greenwald density")!;
    expect(gw.severity).toBe("danger");
  });

  it("all ok at ITER-like operating point", () => {
    const lims = evaluateLimits(0.8, 15, 5.3, 10, { R0: 6.2, a: 2, kappa: 1.7, delta: 0.33 });
    for (const l of lims) expect(l.severity).toBe("ok");
  });
});

describe("Ohmic heating", () => {
  it("is tens of MW at 1 keV, negligible at 10 keV", () => {
    const hot = ohmicPowerMW(15, 1.0, 1.5, 6.2, 2, 1.7);
    expect(hot).toBeGreaterThan(1);
    expect(hot).toBeLessThan(200);
    const burn = ohmicPowerMW(15, 10, 1.5, 6.2, 2, 1.7);
    expect(burn).toBeLessThan(0.5);
  });
});

describe("GEQDSK parser", () => {
  it("parses a small synthetic equilibrium", () => {
    const nw = 4;
    const nh = 3;
    const vals: number[] = [
      ...Array(nw).fill(1), // fpol
      ...Array(nw).fill(0), // pres
      ...Array(nw).fill(0), // ffprim
      ...Array(nw).fill(0), // pprime
      ...Array(nw * nh).fill(0).map((_, i) => (i % nw) / nw), // psirz 0..0.75
      ...Array(nw).fill(2), // qpsi
    ];
    const lines = [
      "TEST CASE".padEnd(48) + "  1",
      "   4   3", // nw, nh in proper I4 fields
      "   0.0   0.0",
      "  3.0  2.0   0.0   0.0",
      "  3.0  0.0  0.05  0.95",
      "  0.0   0.0",
    ];
    // numeric stream: 5 numbers per line, 16-char right-justified fields
    const numLines: string[] = [];
    for (let i = 0; i < vals.length; i += 5) {
      numLines.push(
        vals
          .slice(i, i + 5)
          .map((v) => v.toExponential(9).padStart(16))
          .join("")
      );
    }
    const text = [...lines, ...numLines].join("\n");
    const g = parseGeqdsk(text);
    expect(g.nw).toBe(nw);
    expect(g.nh).toBe(nh);
    expect(g.simagx).toBeCloseTo(0.05);
    expect(g.sibry).toBeCloseTo(0.95);
    expect(g.qpsi[0]).toBe(2);
    expect(g.psirz.length).toBe(nh);
    expect(g.psirz[0].length).toBe(nw);
    const segs = fluxContourSegments(g, [0.3, 0.6]);
    expect(segs.length).toBe(2);
    expect(segs[0].length).toBeGreaterThan(0);
    expect(segs[1].length).toBeGreaterThan(0);
  });
});
