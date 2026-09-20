/**
 * Shared types for the 0-D tokamak physics engine.
 * All modules in lib/physics are pure TypeScript with zero dependencies.
 */

/** User-controllable machine + plasma parameters. */
export interface TokamakParams {
  /** Major radius [m] */
  R0: number;
  /** Minor radius [m] */
  a: number;
  /** Elongation κ (Miller model) */
  kappa: number;
  /** Triangularity δ (Miller model) */
  delta: number;
  /** Toroidal magnetic field on axis [T] */
  Bt: number;
  /** Plasma current [MA] */
  Ip: number;
  /** Volume-averaged electron (= ion) density [10^20 m^-3] */
  n20: number;
  /** Auxiliary heating power [MW] */
  pAuxMW: number;
  /** Fraction of alpha power retained in the plasma (0..1) */
  fAlpha: number;
  /** Vertical field/machine: fraction of IPB98 achieved (H98 factor) */
  H98: number;
  /** Impurity content: effective charge Z_eff */
  Zeff: number;
  /** Deuterium-tritium mix: tritium fraction (0..1), optimum 0.5 */
  tritiumFraction: number;
  /** Confinement regime: auto switches on L-H threshold power */
  regime: "auto" | "L" | "H";
}

/** Full 0-D state evolved by the power-balance integrator. */
export interface PlasmaState {
  /** Volume-averaged temperature [keV] (T_i = T_e assumed) */
  TkeV: number;
  /** Stored thermal energy [J] */
  WJ: number;
  /** Energy confinement time [s] (diagnostic, from last step) */
  tauE: number;
  /** Simulated time since pulse start [s] */
  t: number;
}

/** Snapshot of all derived quantities for UI display. */
export interface SimFrame {
  state: PlasmaState;
  /** Fusion power [MW] */
  pFusMW: number;
  /** Alpha-particle heating power deposited in plasma [MW] */
  pAlphaMW: number;
  /** Net alpha heating (with confinement fraction) [MW] */
  pAlphaNetMW: number;
  /** Auxiliary heating [MW] */
  pAuxMW: number;
  /** Bremsstrahlung radiation loss [MW] */
  pBremMW: number;
  /** Transport (conduction/convection) loss [MW] */
  pLossMW: number;
  /** Ohmic heating [MW] */
  pOhmMW: number;
  /** Fusion gain Q = P_fus / P_aux */
  Q: number;
  /** Lawson triple product n·T·τ_E [keV·s/m^3] */
  tripleProduct: number;
  /** Plasma volume [m^3] */
  volume: number;
  /** Effective elongation used by IPB scaling */
  kappaIPB: number;
  /** Safety factor at 95% flux surface (approx) */
  q95: number;
  /** Normalized beta [%] */
  betaN: number;
  /** L-H threshold power [MW] */
  pLhMW: number;
  /** Active confinement regime: "H" or "L" */
  activeRegime: "H" | "L";
  /** Stability limit evaluations */
  limits: LimitStatus[];
}

/** Result of checking one stability limit. */
export interface LimitStatus {
  /** Limit name, e.g. "Greenwald density" */
  name: string;
  /** 0 (safe) .. 1 (at limit) .. >1 (violated) */
  ratio: number;
  /** Human-readable detail, e.g. "n/n_GW = 0.8" */
  detail: string;
  /** Severity class derived from ratio */
  severity: "ok" | "warn" | "danger";
}

/** Fixed machine/plasma constants that are not user sliders. */
export interface MachineConfig {
  /** Average plasma atomic mass number (D-T mix ≈ 2.5) */
  M: number;
}
