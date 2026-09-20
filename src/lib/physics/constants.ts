/**
 * Physical constants (SI unless noted) and unit helpers.
 * Values: CODATA 2018 / standard plasma physics references.
 */

/** Elementary charge [C] */
export const E_CHARGE = 1.602176634e-19;
/** Vacuum permeability [H/m] */
export const MU0 = 1.25663706212e-6;

/** keV -> Joules */
export const KEV_TO_J = E_CHARGE * 1e3; // ≈ 1.602e-16

/** D-T fusion energy release [J] (17.59 MeV) */
export const E_FUS_J = 17.59e6 * E_CHARGE;
/** Alpha particle share of D-T energy (3.52 MeV / 17.59 MeV) */
export const ALPHA_SHARE = 3.52 / 17.59;

/**
 * Bremsstrahlung coefficient for e-ion radiation.
 * P_brem = C_B · n_e² · Z_eff · sqrt(T_keV)  [W/m^3]
 * C_B = 5.35e-37 W·m^3·keV^-1/2 (NRL Plasma Formulary / standard texts),
 * multiplied by Z_eff for trace-impurity enhancement.
 */
export const C_BREM = 5.35e-37;

/** Specific plasma constants */
export const MASS_DT_AMU = 2.5; // 50:50 D-T average ion mass
