/**
 * Bosch–Hale (1992) Maxwellian-averaged D-T reactivity ⟨σv⟩(T).
 *
 * H.-S. Bosch, G.M. Hale, "Improved formulas for fusion cross-sections and
 * thermal reactivities", Nucl. Fusion 32 (1992) 611 — Eq. (12)–(14),
 * Table VII coefficients for D(t,n)α.
 *
 * Valid 0.2–100 keV; accuracy within ~2% of the R-matrix evaluation.
 * Pure TypeScript port of the published fit (cross-checked against
 * PlasmaPy's tested implementation and the reference value
 * ⟨σv⟩(10 keV) = 1.13616547e-22 m^3/s).
 */

/** Bosch-Hale Table VII coefficients for D(t,n)α. */
const C1 = 1.17302e-9;
const C2 = 1.51361e-2;
const C3 = 7.51886e-2;
const C4 = 4.60643e-3;
const C5 = 1.35e-2;
const C6 = -1.0675e-4;
const C7 = 1.366e-5;
/** Gamow constant B_G [keV^1/2] for D-T */
const B_G = 34.3827;
/** Reduced-mass rest energy m_r·c² [keV] for D-T */
const MR_C2 = 1124656;

/** Validity range of the fit [keV] */
export const BOSCH_HALE_TMIN = 0.2;
export const BOSCH_HALE_TMAX = 100;

/**
 * θ(T) Padé approximant, Bosch–Hale Eq. (13).
 */
function theta(T: number): number {
  const num = T * (C2 + T * (C4 + T * C6));
  const den = 1 + T * (C3 + T * (C5 + T * C7));
  return T / (1 - num / den);
}

/**
 * Maxwellian-averaged D-T reactivity ⟨σv⟩ in m^3/s.
 * (The Bosch–Hale C1 coefficients natively produce cm^3/s; we convert.)
 * @param TkeV ion temperature in keV (clamped to fit validity range)
 */
export function sigmaVDT(TkeV: number): number {
  const T = Math.min(Math.max(TkeV, BOSCH_HALE_TMIN), BOSCH_HALE_TMAX);
  const th = theta(T);
  const xi = Math.cbrt((B_G * B_G) / (4 * th));
  return (
    1e-6 * C1 * th * Math.sqrt(xi / (MR_C2 * T * T * T)) * Math.exp(-3 * xi)
  );
}
