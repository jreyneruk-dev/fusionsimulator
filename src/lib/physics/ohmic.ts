/**
 * Ohmic heating via Spitzer resistivity.
 * η_∥ = 1.03e-4 · Zeff · Te[eV]^-1.5  [Ω·m]  (NRL Plasma Formulary form)
 * P_OH = I_p² · η · (2πR0) / (π a² κ)
 */
export function ohmicPowerMW(
  IpMA: number,
  TekeV: number,
  Zeff: number,
  R0: number,
  a: number,
  kappa: number
): number {
  if (TekeV <= 0.02) return 0;
  const TeEeV = TekeV * 1000;
  const eta = 1.03e-4 * Zeff * Math.pow(TeEeV, -1.5); // Ω·m
  const circumference = 2 * Math.PI * R0;
  const crossSection = Math.PI * a * a * kappa;
  const resistance = (eta * circumference) / crossSection; // Ω
  const Ip = IpMA * 1e6; // A
  return (resistance * Ip * Ip) / 1e6; // W -> MW
}
