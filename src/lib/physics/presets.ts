/**
 * Machine presets for well-known tokamaks, at representative operating
 * points from published design/scenario values. Values are engineering
 * round numbers chosen so the 0-D model reproduces each device's
 * headline performance when simulated.
 */
import type { TokamakParams } from "./types";

export interface Preset {
  name: string;
  description: string;
  params: TokamakParams;
}

export const PRESETS: Preset[] = [
  {
    name: "ITER",
    description: "500 MW fusion / 50 MW heating design point, Q ≈ 10",
    params: {
      R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.33,
      Bt: 5.3, Ip: 15, n20: 1.0, pAuxMW: 50,
      fAlpha: 0.95, H98: 1.0, Zeff: 1.7, tritiumFraction: 0.5,
      regime: "H",
    },
  },
  {
    name: "JET D-T",
    description: "1997 record: 16 MW fusion, Q ≈ 0.65",
    params: {
      R0: 2.96, a: 0.96, kappa: 1.67, delta: 0.2,
      Bt: 3.45, Ip: 4, n20: 0.55, pAuxMW: 24,
      fAlpha: 0.9, H98: 1.0, Zeff: 1.8, tritiumFraction: 0.5,
      regime: "H",
    },
  },
  {
    name: "SPARC",
    description: "Compact high-field ARC-class: targets Q ≈ 10",
    params: {
      R0: 1.85, a: 0.57, kappa: 1.75, delta: 0.37,
      Bt: 12.2, Ip: 8.7, n20: 2.7, pAuxMW: 12,
      fAlpha: 0.95, H98: 1.0, Zeff: 1.6, tritiumFraction: 0.5,
      regime: "H",
    },
  },
  {
    name: "ARC",
    description: "CFS design with REBCO magnets, net-electric concept",
    params: {
      R0: 3.3, a: 1.13, kappa: 1.85, delta: 0.5,
      Bt: 9.2, Ip: 9.9, n20: 2.3, pAuxMW: 25,
      fAlpha: 0.95, H98: 1.2, Zeff: 1.6, tritiumFraction: 0.5,
      regime: "H",
    },
  },
  {
    name: "NSTX",
    description: "Spherical tokamak, low aspect ratio physics testbed",
    params: {
      R0: 0.85, a: 0.685, kappa: 2.2, delta: 0.35,
      Bt: 0.55, Ip: 1, n20: 0.6, pAuxMW: 7,
      fAlpha: 0.9, H98: 1.0, Zeff: 1.5, tritiumFraction: 0.1,
      regime: "H",
    },
  },
  {
    name: "DEMO",
    description: "European DEMO 2017 baseline: ~2 GW fusion",
    params: {
      R0: 9.0, a: 2.9, kappa: 1.65, delta: 0.33,
      Bt: 5.0, Ip: 19, n20: 0.95, pAuxMW: 50,
      fAlpha: 0.95, H98: 1.1, Zeff: 1.7, tritiumFraction: 0.5,
      regime: "H",
    },
  },
];
