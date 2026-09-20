/**
 * Operational stability limits for the tokamak 0-D model.
 *
 * - Greenwald density limit: M. Greenwald et al., Nucl. Fusion 28 (1988) 2199.
 *     n_GW [10^20 m^-3] = IpMA / (π a²)
 * - Troyon beta limit: F. Troyon et al., Plasma Phys. Control. Fusion 26 (1984) 209.
 *     β_N = β[%] · a·Bt / IpMA ≤ ~3
 * - Kink/safety-factor limit: q95 must stay above ~2.
 */
import type { LimitStatus } from "./types";
import type { MillerParams } from "./miller";
import { q95 } from "./miller";

export const GREENWALD_FRACTION_WARN = 0.85;
export const TROYON_BETA_N_MAX = 3.0;
export const Q95_MIN = 2.0;

function classify(ratio: number, warn: number): LimitStatus["severity"] {
  if (ratio >= 1) return "danger";
  if (ratio >= warn) return "warn";
  return "ok";
}

/**
 * Greenwald density [10^20 m^-3].
 */
export function greenwaldDensity(IpMA: number, a: number): number {
  return IpMA / (Math.PI * a * a);
}

/**
 * Volume-averaged plasma pressure [Pa]: p = 2 n k T (electrons + ions).
 */
export function plasmaPressurePa(n20: number, TkeV: number): number {
  return 2 * n20 * 1e20 * TkeV * 1.602176634e-16;
}

/**
 * Toroidal beta [%]: 2 μ0 <p> / Bt², in percent.
 */
export function betaPercent(
  n20: number,
  TkeV: number,
  Bt: number
): number {
  return ((2 * 1.25663706212e-6 * plasmaPressurePa(n20, TkeV)) / (Bt * Bt)) * 100;
}

/**
 * Evaluate all operational limits for the current operating point.
 */
export function evaluateLimits(
  n20: number,
  IpMA: number,
  Bt: number,
  TkeV: number,
  geom: MillerParams
): LimitStatus[] {
  const nGw = greenwaldDensity(IpMA, geom.a);
  const ratioGw = n20 / Math.max(nGw, 1e-6);
  const betaN =
    (betaPercent(n20, TkeV, Bt) * geom.a * Bt) / Math.max(IpMA, 0.01);
  const q = q95(geom, Bt, IpMA);
  const ratioQ = Q95_MIN / Math.max(q, 0.05);
  const ratioBeta = betaN / TROYON_BETA_N_MAX;

  return [
    {
      name: "Greenwald density",
      ratio: ratioGw,
      detail: `n/n_GW = ${ratioGw.toFixed(2)} (n_GW = ${nGw.toFixed(2)}×10²⁰ m⁻³)`,
      severity: classify(ratioGw, GREENWALD_FRACTION_WARN),
    },
    {
      name: "Troyon β-limit",
      ratio: ratioBeta,
      detail: `β_N = ${betaN.toFixed(2)} (limit 3.0)`,
      severity: classify(ratioBeta, 0.85),
    },
    {
      name: "Kink (q95)",
      ratio: ratioQ,
      detail: `q95 = ${q.toFixed(2)} (limit ≥ 2.0)`,
      severity: classify(ratioQ, 0.9),
    },
  ];
}
