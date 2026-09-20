# 03 — Physics model

Every equation implemented in `src/lib/physics/`, with units, validity ranges, and citations. The engine is pure TypeScript with zero dependencies; all models are published and peer-reviewed.

## Notation

| Symbol | Meaning | Units |
|---|---|---|
| R₀ | major radius | m |
| a | minor radius | m |
| κ, δ | elongation, triangularity (Miller) | – |
| B_t | toroidal field on axis | T |
| I_p | plasma current | MA |
| n̄ | volume-averaged electron density | 10²⁰ m⁻³ |
| T | volume-averaged temperature (T_i = T_e) | keV |
| W | stored thermal energy | J |
| τ_E | energy confinement time | s |
| V | plasma volume | m³ |

## 1. Energy balance (the ODE)

`power-balance.ts` evolves a single state variable — the stored thermal energy W:

```
dW/dt = P_aux + f_α·P_α + P_OH − P_loss − P_rad
```

- **P_aux** — external heating (user slider) [MW]
- **P_α** — alpha-particle heating from D-T reactions; **f_α** is the confined fraction (fast alphas orbit mostly inside the plasma; default 0.95)
- **P_OH** — ohmic heating: the plasma current against the plasma's own electrical resistance
- **P_loss** — transport losses (conduction + convection), = W/τ_E by definition
- **P_rad** — bremsstrahlung radiation (below)

Temperature is recovered from W through the ideal-gas relation for a fully ionized D-T mix (electrons + ions):

```
W = 3 n k T V      →      T = W / (3 n V k)
```

(kT = 1 keV = 1.602×10⁻¹⁶ J.) Integration is **RK4** with sub-stepping capped at 5 ms of simulated time. The integrator is unconditional-stability-safe for our parameter range because τ_E ≥ ~10 ms always exceeds the step.

## 2. Fusion power — Bosch–Hale reactivity

For a Maxwellian plasma, the D-T reaction rate per volume is

```
P_fus = (n_D · n_T) · ⟨σv⟩(T) · E_fus · V
```

with E_fus = 17.59 MeV and n_D·n_T = n²/4 for a 50:50 mix (a `mixFactor = 4·f_D·f_T` generalizes to arbitrary mixes; it peaks at 0.5 tritium fraction).

**⟨σv⟩(T)** is the Maxwellian-averaged reactivity, from
H.-S. Bosch & G.M. Hale, *Improved formulas for fusion cross-sections and thermal reactivities*, **Nucl. Fusion 32 (1992) 611**, Eqs. 12–14, Table VII (`bosch-hale.ts`):

```
⟨σv⟩ = C₁ · θ · √(ξ / (m_r c² T³)) · exp(−3ξ)
ξ = (B_G² / 4θ)^(1/3)
θ = T / (1 − T(C₂ + T(C₄ + T·C₆)) / (1 + T(C₃ + T(C₅ + T·C₇))))
```

D-T coefficients (Table VII):

| C₁ | C₂ | C₃ | C₄ | C₅ | C₆ | C₇ | B_G | m_r c² |
|---|---|---|---|---|---|---|---|---|
| 1.17302×10⁻⁹ | 1.51361×10⁻² | 7.51886×10⁻² | 4.60643×10⁻³ | 1.35×10⁻² | −1.0675×10⁻⁴ | 1.366×10⁻⁵ | 34.3827 | 1.124656×10⁶ |

**Units note (verified the hard way — see research log):** the C₁ coefficients natively produce **cm³/s**; the engine multiplies by 10⁻⁶ to return m³/s. Validity: **0.2–100 keV** (the engine clamps). The fit is within ~2% of R-matrix cross-section data; our independent Maxwellian integration of the Bosch–Hale cross-section (Table IV Padé) matches the closed form to <1% at 1, 10, 20, 50, 100 keV.

## 3. Confinement — empirical scalings

τ_E is the million-dollar number. It's given by empirical power-law fits to the international multi-device database (`confinement.ts`).

### H-mode: IPB98(y,2)

From ITER Physics Basis, Nucl. Fusion 39 (1999) 2175; form/units cross-checked against UKAEA PROCESS (scaling #34):

```
τ_E = 0.0562 · I_p^0.93 · B_t^0.15 · n̄₁₉^0.41 · P_L^(−0.69) · R₀^1.97 · κ_IPB^0.78 · ε^0.58 · M^0.19
```

- n̄₁₉ in 10¹⁹ m⁻³, P_L in MW (loss power), ε = a/R₀, M = mean ion mass (2.5 for D-T)
- **κ_IPB = V / (2πR₀) / (πa²)** — the volume-defined elongation the database used
- **P_L = W/τ_E** — self-referential! The engine resolves this with a fixed-point iteration (contraction factor 0.69 per iteration; 30 iterations → residual <10⁻⁵)
- **H98** multiplies the result — confinement quality relative to the database average

Note the strong size scaling (R₀^1.97): *bigger reactors confine much better*. This is why fusion machines keep growing.

### L-mode: ITER89-P

Yushmanov et al., Nucl. Fusion 30 (1990) 1999:

```
τ_E = 0.048 · I_p^0.85 · R₀^1.2 · a^0.3 · κ^0.5 · n̄₂₀^0.1 · B_t^0.2 · M^0.5 · P_L^(−0.5)
```

### L–H threshold: Martin scaling

Which mode applies? Above a threshold heating power the plasma transitions to H-mode. We use the ITPA database scaling (Y.R. Martin et al., 2008):

```
P_LH = 2.15 · n₂₀^0.782 · B_t^0.772 · a^0.975 · R₀^0.999   [MW]
```

The database uses line-averaged density; the engine takes volume-averaged, so the auto-regime check can be slightly conservative — documented honestly rather than hidden.

## 4. Radiation — bremsstrahlung

```
P_brem = C_B · n_e² · Z_eff · √T_keV · V ,     C_B = 5.35×10⁻³⁷ W·m³·keV^(−1/2)
```

(NRL Plasma Formulary value for hydrogenic plasma; Z_eff multiplies in the impurity enhancement that stands in for line radiation at this fidelity.) Impurity slider Z_eff raises radiation and ohmic heating — watch the plasma cool as you dirty it.

## 5. Ohmic heating — Spitzer resistivity

```
η_∥ = 1.03×10⁻⁴ · Z_eff · T_e[eV]^(−3/2)   [Ω·m]
P_OH = I_p² · η_∥ · (2πR₀) / (π a² κ)
```

A 1 keV ITER-like plasma draws ~10–100 MW of ohmic heating; at 10 keV it's negligible (resistivity falls as T^(−3/2)) — which is why reactors *need* auxiliary heating to reach burn.

## 6. Geometry — Miller model

Flux surfaces (constant-pressure nested surfaces) are parameterized (`miller.ts`) as:

```
R(θ) = R₀ + ρ·a·cos(θ + δ·sin θ)      z(θ) = ρ·a·κ·sin θ
```

Volume: `V = 2π² R₀ a² κ (1 − 0.2 δ²)` (≈830 m³ for ITER — matches published value).

**q95** (safety factor proxy, from the cylindrical q with shaping correction):

```
q_cyl = 5 a² κ B_t / (R₀ I_p)        q95 ≈ q_cyl · (1 + 1.24(κ−1)) / (1 + ε²)
```

ITER: q95 ≈ 3.1. The 3-D field lines wind with this q.

## 7. Stability limits

`limits.ts` computes three operational boundaries; each becomes a colored bar in the UI:

| Limit | Condition | Citation |
|---|---|---|
| **Greenwald density** | n̄ ≤ I_p/(πa²) | M. Greenwald et al., Nucl. Fusion 28 (1988) 2199 |
| **Troyon β limit** | β_N = β[%]·a·B_t/I_p ≤ 3 | F. Troyon et al., PPCF 26 (1984) 209 |
| **Kink (q95)** | q95 ≥ 2 | standard operational criterion |

with `β[%] = 2μ₀⟨p⟩/B_t² · 100` and `⟨p⟩ = 2 n k T` (electrons + ions).

## 8. What the model deliberately ignores

Stated plainly (see doc 05 for what lies beyond):

- **Profiles** — everything is volume-averaged; real machines have pedestals and sawteeth
- **Turbulent transport** — τ_E is empirical, not first-principles; no ELMs, no L-H hysteresis
- **Helium ash & fueling** — n is prescribed, not evolved; burnup fraction is not tracked
- **Current diffusion** — I_p is a knob, not a solution of the induction equation
- **MHD instabilities** — limits are checked, not simulated; disruptions are a flag, not a crash
- **Fast-ion physics** — f_α is a constant, not an orbit calculation
- **Synchrotron & impurity line radiation** — folded into one Z_eff-enhanced bremsstrahlung term

The result: absolutely trustworthy *trends* and order-of-magnitude power balance — the same level real design teams use for first-pass scoping (PROCESS-style system codes) — with none of the edge physics that fills real control rooms with alarms.
