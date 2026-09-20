/**
 * 0-D global power balance — the heart of the simulator.
 *
 * State variable: W (stored thermal energy, J).
 *   dW/dt = P_aux + f_α·P_α + P_OH − W/τ_E − P_rad
 *
 * Temperature is recovered from W via W = 3 n k T (electrons + ions,
 * volume-averaged, T_i = T_e). The confinement time τ_E is given by
 * empirical scalings evaluated at the *loss* power P_L = W/τ_E, so the
 * (τ_E, P_L) pair is found by fixed-point iteration inside each derivative
 * evaluation. The ODE is integrated with fixed-step RK4.
 *
 * Regime logic: "auto" mode compares total heating against the Martin
 * L-H threshold power; above threshold the plasma is in H-mode (IPB98(y,2)),
 * below it falls back to L-mode (ITER89-P).
 */
import type { SimFrame, TokamakParams, PlasmaState } from "./types";
import { sigmaVDT } from "./bosch-hale";
import { tauEIPB98y2, tauEITER89P, pLhMartinMW } from "./confinement";
import { pBremMW } from "./radiation";
import { ohmicPowerMW } from "./ohmic";
import { evaluateLimits, betaPercent } from "./limits";
import { kappaIPB, plasmaVolume, q95, type MillerParams } from "./miller";
import {
  E_FUS_J,
  ALPHA_SHARE,
  KEV_TO_J,
  MASS_DT_AMU,
} from "./constants";

/** D-T fuel mix reactivity factor: n_D·n_T/(n²/4) peaks at 1 for 50:50. */
function mixFactor(fT: number): number {
  const fD = 1 - fT;
  return 4 * fD * fT;
}

/** Power balance derivatives (all powers in MW except W in J). */
interface Balance {
  pFusMW: number;
  pAlphaMW: number;
  pAlphaNetMW: number;
  pAuxMW: number;
  pOhmMW: number;
  pBremMW: number;
  pLossMW: number;
  tauE: number;
  dWdt: number;
}

/**
 * Evaluate the power balance at state W for given params.
 * Internal fixed-point solves τ_E(P_L) consistent with P_L = W/τ_E.
 */
function balance(
  W: number,
  p: TokamakParams,
  V: number,
  kappaI: number,
  eps: number
): Balance {
  const T = W / (3 * p.n20 * 1e20 * V * KEV_TO_J); // keV
  const safeT = Math.max(T, 1e-3);

  // Fusion power
  const sv = sigmaVDT(safeT);
  const pFusW =
    0.25 * (p.n20 * 1e20) ** 2 * sv * E_FUS_J * mixFactor(p.tritiumFraction) * V;
  const pFusMW = pFusW / 1e6;
  const pAlphaMW = pFusMW * ALPHA_SHARE;
  const pAlphaNetMW = pAlphaMW * p.fAlpha;

  // Heating
  const pAuxMW = p.pAuxMW;
  const pOhmMW = ohmicPowerMW(p.Ip, safeT, p.Zeff, p.R0, p.a, p.kappa);

  // Radiation
  const pRad = pBremMW(p.n20, safeT, p.Zeff, V);

  // Confinement: fixed point on (tauE, pLoss)
  const n19 = p.n20 * 10;
  let pLoss: number;
  let tauE: number;
  if (p.regime === "L") {
    // ITER89-P: τ ∝ P^-0.5. Fixed point τ = K·(W/τ)^-0.5, contraction
    // factor 0.5 per iteration.
    pLoss = Math.max(W / 1e6, 1e-3); // MW, seed τ at P=1
    tauE = tauEITER89P(p.Ip, p.Bt, p.n20, pLoss, p.R0, p.a, p.kappa, MASS_DT_AMU);
    pLoss = W / 1e6 / tauE;
    for (let i = 0; i < 20; i++) {
      tauE = tauEITER89P(p.Ip, p.Bt, p.n20, Math.max(pLoss, 1e-3), p.R0, p.a, p.kappa, MASS_DT_AMU);
      pLoss = W / 1e6 / tauE;
    }
  } else {
    // H-mode IPB98(y,2): τ ∝ P^-0.69, contraction factor 0.69 per
    // iteration; 30 iterations → ~1e-5 residual.
    pLoss = Math.max(W / 1e6, 1e-3);
    tauE = tauEIPB98y2({
      IpMA: p.Ip, Bt: p.Bt, n19, pLossMW: pLoss, R0: p.R0,
      kappaIPB: kappaI, epsilon: eps, M: MASS_DT_AMU, H98: p.H98,
    });
    pLoss = W / 1e6 / tauE;
    for (let i = 0; i < 30; i++) {
      tauE = tauEIPB98y2({
        IpMA: p.Ip, Bt: p.Bt, n19, pLossMW: Math.max(pLoss, 1e-3), R0: p.R0,
        kappaIPB: kappaI, epsilon: eps, M: MASS_DT_AMU, H98: p.H98,
      });
      pLoss = W / 1e6 / tauE;
    }
  }
  pLoss = Math.max(pLoss, 1e-6);

  const dWdt =
    (pAuxMW + pAlphaNetMW + pOhmMW - pLoss - pRad) * 1e6; // J/s

  return { pFusMW, pAlphaMW, pAlphaNetMW, pAuxMW, pOhmMW, pBremMW: pRad, pLossMW: pLoss, tauE, dWdt };
}

/** One RK4 step of the power-balance ODE. Returns new W and last balance. */
function rk4Step(
  W: number,
  dt: number,
  p: TokamakParams,
  V: number,
  kappaI: number,
  eps: number
): { W: number; b: Balance } {
  const f = (w: number) => balance(w, p, V, kappaI, eps).dWdt;
  const k1 = f(W);
  const k2 = f(Math.max(W + (dt / 2) * k1, 1));
  const k3 = f(Math.max(W + (dt / 2) * k2, 1));
  const k4 = f(Math.max(W + dt * k3, 1));
  const b = balance(W, p, V, kappaI, eps);
  return { W: Math.max(W + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4), 1), b };
}

/**
 * Advance the simulation by `wallSlice` seconds of simulated time.
 * Returns the new state and a full diagnostic frame for the UI.
 */
export function step(
  state: PlasmaState,
  p: TokamakParams,
  wallSlice: number
): { state: PlasmaState; frame: SimFrame } {
  const geom: MillerParams = { R0: p.R0, a: p.a, kappa: p.kappa, delta: p.delta };
  const V = plasmaVolume(geom);
  const kappaI = kappaIPB(geom);
  const eps = p.a / p.R0;

  // Determine active regime
  const pLh = pLhMartinMW(p.n20, p.Bt, p.a, p.R0);
  let activeRegime: "H" | "L";
  if (p.regime === "L") activeRegime = "L";
  else if (p.regime === "H") activeRegime = "H";
  else {
    const Tnow = state.WJ / (3 * p.n20 * 1e20 * V * KEV_TO_J);
    const svNow = sigmaVDT(Math.max(Tnow, 0.2));
    const pAlphaNow =
      (0.25 * (p.n20 * 1e20) ** 2 * svNow * E_FUS_J * ALPHA_SHARE * mixFactor(p.tritiumFraction) * V) / 1e6;
    const pHeat = p.pAuxMW + p.fAlpha * pAlphaNow;
    activeRegime = pHeat >= pLh ? "H" : "L";
  }

  const params = { ...p, regime: activeRegime } as TokamakParams;

  // Sub-step: cap dt at 5 ms of simulated time; run multiple RK4 steps
  const nSub = Math.max(1, Math.ceil(wallSlice / 0.005));
  const dt = wallSlice / nSub;
  let W = state.WJ;
  for (let i = 0; i < nSub; i++) {
    const r = rk4Step(W, dt, params, V, kappaI, eps);
    W = r.W;
  }
  // Re-evaluate the balance at the final W so the reported frame is
  // exactly consistent with the returned state (W = P_loss·τ_E holds).
  const b = balance(W, params, V, kappaI, eps);

  const T = W / (3 * p.n20 * 1e20 * V * KEV_TO_J);
  const newState: PlasmaState = { TkeV: T, WJ: W, tauE: b.tauE, t: state.t + wallSlice };

  const frame: SimFrame = {
    state: newState,
    pFusMW: b.pFusMW,
    pAlphaMW: b.pAlphaMW,
    pAlphaNetMW: b.pAlphaNetMW,
    pAuxMW: b.pAuxMW,
    pBremMW: b.pBremMW,
    pLossMW: b.pLossMW,
    pOhmMW: b.pOhmMW,
    Q: b.pAuxMW > 1e-3 ? b.pFusMW / b.pAuxMW : b.pFusMW > 0 ? Infinity : 0,
    // Lawson triple product in conventional units: 10^20 keV·s/m³
    tripleProduct: p.n20 * T * b.tauE,
    volume: V,
    kappaIPB: kappaI,
    q95: q95(geom, p.Bt, p.Ip),
    betaN: (betaPercent(p.n20, T, p.Bt) * p.a * p.Bt) / Math.max(p.Ip, 0.01),
    pLhMW: pLh,
    activeRegime,
    limits: evaluateLimits(p.n20, p.Ip, p.Bt, T, geom),
  };
  return { state: newState, frame };
}

/** Initial state at pulse start: seed at 0.5 keV volume-averaged. */
export function initialState(p: TokamakParams): PlasmaState {
  const geom: MillerParams = { R0: p.R0, a: p.a, kappa: p.kappa, delta: p.delta };
  const V = plasmaVolume(geom);
  const T0 = 0.5;
  const W = 3 * p.n20 * 1e20 * T0 * KEV_TO_J * V;
  return { TkeV: T0, WJ: W, tauE: 0.1, t: 0 };
}
