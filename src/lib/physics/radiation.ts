/**
 * Radiation loss: bremsstrahlung with effective-charge enhancement.
 *
 * P_brem = C_B · n_e² · Z_eff · sqrt(T_keV)   [W/m^3]
 * C_B = 5.35e-37 W·m^3·keV^-1/2 (NRL Plasma Formulary value for
 * hydrogenic plasma; the Z_eff factor stands in for line radiation
 * from trace impurities at this level of modeling).
 */
import { C_BREM } from "./constants";

/**
 * Bremsstrahlung power density [W/m^3].
 * @param n20 electron density [10^20 m^-3]
 * @param TekeV electron temperature [keV]
 * @param Zeff effective charge
 */
export function pBremDensity(
  n20: number,
  TekeV: number,
  Zeff: number
): number {
  const ne = n20 * 1e20;
  return C_BREM * ne * ne * Zeff * Math.sqrt(Math.max(TekeV, 0.05));
}

/**
 * Total bremsstrahlung power [MW].
 */
export function pBremMW(
  n20: number,
  TekeV: number,
  Zeff: number,
  volumeM3: number
): number {
  return (pBremDensity(n20, TekeV, Zeff) * volumeM3) / 1e6;
}
