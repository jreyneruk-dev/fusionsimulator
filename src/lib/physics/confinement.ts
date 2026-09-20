/**
 * Empirical energy-confinement-time scalings.
 *
 * IPB98(y,2): ITER Physics Basis Editors, Nucl. Fusion 39 (1999) 2175;
 * reproduced from UKAEA PROCESS documentation (ukaea.github.io/PROCESS,
 * confinement scalings #34) so units are unambiguous:
 *   τ_E = 0.0562 · Ip[MA]^0.93 · Bt[T]^0.15 · n̄19^0.41 · PL[MW]^-0.69
 *         · R[m]^1.97 · κ_IPB^0.78 · ε^0.58 · M^0.19
 *
 * ITER89-P L-mode: Yushmanov et al., Nucl. Fusion 30 (1990) 1999:
 *   τ_E = 0.048 · Ip^0.85 · R^1.2 · a^0.3 · κ^0.5 · n̄20^0.1 · Bt^0.2 · M^0.5 · PL^-0.5
 *
 * Martin L-H threshold power (Martin et al., 2008 ITPA database):
 *   P_LH = 2.15 · n20^0.782 · Bt^0.772 · a^0.975 · R^0.999  [MW]
 */

/** IPB98(y,2) inputs assembled by caller (all SI/standard units). */
export interface IpB98Input {
  IpMA: number;
  Bt: number;
  n19: number;
  pLossMW: number;
  R0: number;
  kappaIPB: number;
  epsilon: number;
  M: number;
  /** H-factor: confinement enhancement over the scaling (1.0 = nominal) */
  H98: number;
}

/**
 * IPB98(y,2) H-mode energy confinement time [s].
 */
export function tauEIPB98y2(inp: IpB98Input): number {
  const tau =
    0.0562 *
    Math.pow(inp.IpMA, 0.93) *
    Math.pow(inp.Bt, 0.15) *
    Math.pow(Math.max(inp.n19, 1e-6), 0.41) *
    Math.pow(Math.max(inp.pLossMW, 1e-3), -0.69) *
    Math.pow(inp.R0, 1.97) *
    Math.pow(inp.kappaIPB, 0.78) *
    Math.pow(inp.epsilon, 0.58) *
    Math.pow(inp.M, 0.19);
  return tau * inp.H98;
}

/**
 * ITER89-P L-mode energy confinement time [s].
 */
export function tauEITER89P(
  IpMA: number,
  Bt: number,
  n20: number,
  pLossMW: number,
  R0: number,
  a: number,
  kappa: number,
  M: number
): number {
  return (
    0.048 *
    Math.pow(IpMA, 0.85) *
    Math.pow(R0, 1.2) *
    Math.pow(a, 0.3) *
    Math.pow(kappa, 0.5) *
    Math.pow(Math.max(n20, 1e-6), 0.1) *
    Math.pow(Bt, 0.2) *
    Math.pow(M, 0.5) *
    Math.pow(Math.max(pLossMW, 1e-3), -0.5)
  );
}

/**
 * Martin (2008) L-H transition threshold power [MW].
 */
export function pLhMartinMW(
  n20: number,
  Bt: number,
  a: number,
  R0: number
): number {
  return (
    2.15 *
    Math.pow(Math.max(n20, 1e-3), 0.782) *
    Math.pow(Bt, 0.772) *
    Math.pow(a, 0.975) *
    Math.pow(R0, 0.999)
  );
}
