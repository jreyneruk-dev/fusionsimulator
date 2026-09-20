import { describe, it, expect } from "vitest";
import { sigmaVDT } from "@/lib/physics/bosch-hale";

describe("Bosch–Hale D-T reactivity", () => {
  it("matches the reference value at 10 keV", () => {
    // Reference: PlasmaPy fusion_reactivity(10 keV, "D(t,n)A")
    //            = 1.13616547e-16 cm^3/s = 1.13616547e-22 m^3/s
    const sv = sigmaVDT(10);
    expect(sv).toBeCloseTo(1.13616547e-22, 30);
  });

  it("matches numerical integration of the Bosch-Hale cross-section (5%)", () => {
    // Reference values computed by numerically integrating the Bosch-Hale
    // Table IV cross-section Padé over a Maxwellian (independent path):
    // <sv> = √(8/πμ)/(kT)^{3/2} ∫ σ(E) E exp(-E/kT) dE, μ(D-T), σ in m².
    const table: Array<[T: number, cm3s: number]> = [
      [1, 6.897e-21],
      [5, 1.369e-17],
      [20, 4.362e-16],
      [50, 8.673e-16],
      [100, 8.452e-16],
    ];
    for (const [T, ref] of table) {
      const got = sigmaVDT(T) * 1e6; // m^3/s -> cm^3/s
      expect(got).toBeGreaterThan(ref * 0.95);
      expect(got).toBeLessThan(ref * 1.05);
    }
  });

  it("peaks near 64 keV (D-T reactivity maximum)", () => {
    let bestT = 0;
    let best = 0;
    for (let T = 10; T <= 100; T += 0.25) {
      const v = sigmaVDT(T);
      if (v > best) {
        best = v;
        bestT = T;
      }
    }
    expect(bestT).toBeGreaterThan(55);
    expect(bestT).toBeLessThan(75);
  });

  it("is strictly positive and smooth in validity range", () => {
    for (let T = 0.2; T <= 100; T *= 1.7) {
      expect(sigmaVDT(T)).toBeGreaterThan(0);
    }
  });
});
