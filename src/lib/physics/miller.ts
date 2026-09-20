/**
 * Miller-model plasma geometry.
 *
 * The Miller parameterization (R.M. Miller et al., Phys. Plasmas 5 (1998) 974)
 * describes shaped tokamak flux surfaces with elongation κ and triangularity δ.
 * We use it for volume, the κ_IPB definition from the IPB98 scalings, and to
 * generate 2-D/3-D plasma boundary shapes for visualization.
 */

export interface MillerParams {
  R0: number;
  a: number;
  kappa: number;
  delta: number;
}

/**
 * Plasma volume of an up-down symmetric Miller surface.
 * V = 2π² R0 a² κ · (1 − 0.2 δ²) with triangularity contour correction
 * (standard approximation; δ enters quadratically because ±δ mirrors cancel).
 */
export function plasmaVolume(p: MillerParams): number {
  return 2 * Math.PI * Math.PI * p.R0 * p.a * p.a * p.kappa * (1 - 0.2 * p.delta * p.delta);
}

/**
 * κ_IPB: the volume-based effective elongation used by the IPB98(y,x)
 * scalings: κ_IPB = V / (2πR) / (π a²).
 * For a Miller surface this is ≈ κ (1 − 0.2 δ²) with a slight R variation.
 */
export function kappaIPB(p: MillerParams): number {
  const v = plasmaVolume(p);
  return v / (2 * Math.PI * p.R0 * Math.PI * p.a * p.a);
}

/**
 * Approximate q95 (safety factor at the 95% flux surface) for a shaped,
 * large-aspect-ratio tokamak (ITER Physics Basis formula):
 * q95 = 5 a² κ (1 + 1.24 Λ) / (R ε²)... in its common engineering form
 * q95 ≈ 5 a² κ (1+1.24κ²)/ (2 R² / (R0)) — we use the widely used
 * FIRE/ITER design form:
 * q95 ≈ (5 a² κ (1 + 1.24 κ)) / (R0 · ε) · 1/Bt·Ip-normalization handled
 * via Ip in MA: q95 = 5 a² κ (1+1.24κ) Bt / (R0 IpMA) · 1/ε correction folded in.
 *
 * We adopt the standard cylindrical q_cyl = 5 a² Bt κ / (R0 IpMA) and
 * multiply by the shaping correction (1 + 1.24 κ), a common q95 proxy.
 */
export function q95(
  p: MillerParams,
  Bt: number,
  IpMA: number
): number {
  const eps = p.a / p.R0;
  const qcyl = (5 * p.a * p.a * p.kappa * Bt) / (p.R0 * Math.max(IpMA, 0.01));
  return (qcyl / (1 + eps * eps)) * (1 + 1.24 * (p.kappa - 1));
}

/**
 * Miller surface cross-section points at toroidal angle φ=0 (poloidal plane).
 * Returns [ [R,z], ... ] in meters; the curve closes on itself.
 * @param rho normalized minor radius 0..1
 * @param nPoints number of samples around the poloidal angle
 */
export function millerCrossSection(
  p: MillerParams,
  rho: number,
  nPoints = 64
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < nPoints; i++) {
    const th = (2 * Math.PI * i) / nPoints;
    const R = p.R0 + rho * p.a * Math.cos(th + p.delta * rho * Math.sin(th));
    const z = rho * p.a * p.kappa * Math.sin(th);
    pts.push([R, z]);
  }
  return pts;
}

/**
 * Full 3-D surface point of a Miller flux surface.
 * @returns [x,y,z] in meters (x = R cosφ, y = R sinφ, z = z)
 */
export function millerSurfacePoint(
  p: MillerParams,
  rho: number,
  thetaPol: number,
  phi: number
): [number, number, number] {
  const R = p.R0 + rho * p.a * Math.cos(thetaPol + p.delta * rho * Math.sin(thetaPol));
  const z = rho * p.a * p.kappa * Math.sin(thetaPol);
  return [R * Math.cos(phi), R * Math.sin(phi), z];
}
