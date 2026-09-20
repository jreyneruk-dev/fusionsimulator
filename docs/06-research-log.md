# 06 — Research log

The trail of how the physics in this engine was chosen and verified, including the errors caught along the way. Kept honest on purpose: this is the page a skeptical reviewer should read.

## Session timeline

### 1. Landscape survey

Searched for prior art on browser/laptop-scale tokamak simulation:

- **fusionsimulator.io** — interactive browser tokamak; 0-D power balance, IPB98(y,2), Cerfon-Freidberg equilibria, 3-D port view. Nearest neighbor. Read their feature set; ours differentiates on scenario/controller modes, documented-from-scratch engine, presets, GEQDSK ingest.
- **FusionCpp** (Amineharrabi) — C++/OpenGL 3-D particle tokamak with volumetric raytracing; Lorentz-force particles + D-T reactions. Confirmed the "visual spectacle" path exists; not interactive physics-first.
- **TORAX** (google-deepmind) — JAX-based differentiable transport code; pip install, QLKNN surrogate transport, CHEASE/EQDSK geometry. Verified installation path and feature list from the repo README. Too heavy to wrap for a browser playground, perfect for the v2 bridge.
- **FreeGS** (Ben Dudson, York) — free-boundary Grad–Shafranov in Python; PyPI; writes G-EQDSK. Chosen as the ingest source for real equilibria.
- **PROCESS** (UKAEA) — the EU's tokamak systems code; its published physics-model documentation became the unit-disambiguation authority for confinement scalings.

Conclusion: no existing project combines an interactive browser playground with a clean-room documented engine + research ingest. Proceeded.

### 2. Bosch–Hale verification (the deepest rabbit hole, worth documenting)

The D-T reactivity fit needed exact coefficients. Steps:

1. **Formula shape** confirmed from two independent derivations found online (a Japanese-language physics compendium with full derivation, and PlasmaPy's documented source): ⟨σv⟩ = C₁·θ·√(ξ/(m_r c² T³))·exp(−3ξ), with ξ=(B_G²/4θ)^⅓ and θ(T) a Padé approximant. Both agree; matches Bosch–Hale Eqs. 12–14.
2. **Coefficients C₁–C₇** found in a quoted Python snippet (C₁=1.17302e-9 … C₇=1.366e-5) and then confirmed from **PlasmaPy's JSON data file** (`rxty_pade_polynomial_coefficients.json`, `D(t,n)A` entry) together with B_G=34.3827, m_r c²=1,124,656 keV.
3. **Hand-evaluation cross-check**: I manually evaluated θ(10), ξ(10), and the full expression and got 1.13617e-16 cm³/s before discovering PlasmaPy's doctest states 1.13616547e-16 — five matching digits without knowing their answer in advance.
4. **The unit trap** (this cost a failed test run): my first implementation returned 1.136e-16 *m³/s* — a factor 10⁶ high. The failed vitest assertion against the m³/s reference exposed it. Root cause: Bosch–Hale C₁ natively produces **cm³/s** (the paper's convention). Fix: ×10⁻⁶ conversion in `sigmaVDT`, documented in code and doc 03.
5. **Independent-path verification**: rather than trusting the closed form or my memory of tables, I wrote a Python script integrating the Bosch–Hale **cross-section** (Table IV Padé, from PlasmaPy's `xs_...json`) over a Maxwellian numerically (600k-step midpoint rule). Results at 1/10/20/50/100 keV matched the closed-form implementation to **0.5–0.6%** (the residual being integration error). Two caught bugs in the verification script itself: an `exp(+B_G/√E)` overflow (sign slip) and a missing keV→J² factor (c²) in the prefactor — both caught by sanity-checking orders of magnitude, which is exactly why the log records them.
6. **Corollary**: a "standard table" value I initially coded from memory for 1 keV (5.5e-21 cm³/s) was ~20% off the true value (6.897e-21). The numerical integration arbitrated. Lesson recorded: never hard-code remembered constants into tests; derive or fetch.

### 3. Confinement scalings

- My memory of IPB98(y,2) evaluated to τ_E ≈ 1.75 s at ITER parameters vs the published ≈3.5 s — a factor-2 disagreement. Rather than ship a guessed constant, I pulled the **UKAEA PROCESS documentation** for the confinement module, which lists all 37 scalings with explicit units. IPB98(y,2) (their #34): `τ_E = 0.0562 I_p^0.93 B^0.15 n₁₉^0.41 P_L^-0.69 R^1.97 κ_IPB^0.78 ε^0.58 M^0.19`. Hand-evaluation at ITER parameters: **3.59 s** ✓ (published band 3.4–3.7).
- The κ_IPB subtlety matters: the database defines elongation from volume, κ_IPB = V/(2πR)/(πa²) — implemented as such in `miller.ts`.
- ITER89-P taken from the same PROCESS page (#6, matching Yushmanov 1990).
- **Martin threshold**: found a thesis quoting the fit with uncertainties: P_thresh = 2.15^(±0.107) · n₂₀^0.782(±0.037) · B^0.772(±0.031) · a^0.975 · R^0.999 [MW]. My first test band (35–75 MW at ITER) failed at 94.8 MW; recomputation showed my remembered "ITER P_LH ≈ 50–60 MW" corresponds to the *line-averaged* density input (0.7×10²⁰) while the engine feeds volume-averaged (1.0×10²⁰). Test updated with the explanation rather than quietly widened.

### 4. Benchmark sanity of the assembled model

With the verified pieces:

| Check | Model | Published | Status |
|---|---|---|---|
| ITER τ_E (H-mode) | 3.59 s | 3.4–3.7 s | ✓ |
| ITER P_fus / Q | lands in test band 200–900 MW / Q 5–15 | design 500 MW / Q=10 | ✓ (0-D ≈ design point) |
| ITER volume (Miller) | ≈ 830 m³ | ≈ 830–840 m³ | ✓ |
| ITER q95 proxy | ≈ 3 | ≈ 3 | ✓ |
| ITER β_t at n=1e20, T=8 keV | ≈ 2.5% | ≈ 2.5% | ✓ |
| JET D-T (Q≈0.6) | sub-unity Q at 24 MW aux | 0.62 (1997) | ✓ qualitatively |
| SPARC high-field | Q > 5 achievable in 0-D | Q≈10 target (2-3 bands) | ✓ directionally |

### 5. Stack & environment findings

- Node v25/npm 11 in the environment; Next 15 + React 19 install cleanly with `--legacy-peer-deps` (three's @types peer range).
- Tailwind v4 via `@tailwindcss/postcss`, no config file needed.
- No git repository initialized in the workspace (fresh directory) — noted for the user.

## Source list

| Source | Used for |
|---|---|
| Bosch & Hale, Nucl. Fusion 32 (1992) 611 | D-T reactivity (Eqs. 12–14, Tables IV/VII) |
| PlasmaPy `formulary.fusion` + data JSONs (docs.plasmapy.org) | coefficient cross-check, reference values |
| ITER Physics Basis, Nucl. Fusion 39 (1999) 2175 | IPB98(y,2) |
| UKAEA PROCESS docs (ukaea.github.io/PROCESS) | scaling forms/units for #6, #34; κ_IPB definition |
| Yushmanov et al., Nucl. Fusion 30 (1990) 1999 | ITER89-P |
| Y.R. Martin et al. (2008 ITPA) | L-H threshold power |
| Greenwald, Nucl. Fusion 28 (1988) 2199 | density limit |
| Troyon et al., PPCF 26 (1984) 209 | β limit |
| NRL Plasma Formulary | bremsstrahlung coefficient, Spitzer resistivity |
| Miller et al., Phys. Plasmas 5 (1998) 974 | flux-surface parameterization |
| google-deepmind/torax, freegs-plasma/freegs (GitHub) | bridge/ingest design |
| Wikipedia: Lawson criterion | triple-product conventions, cross-checks |
| fusionsimulator.io, FusionCpp | landscape survey |

## Open questions / known approximations

- ITER89-P vs IPB98(y,2) in auto-mode transition can flip regimes noisily near threshold; the UI debounces via regime indicator only (no hysteresis — a candidate v2 polish).
- The GEQDSK boundary-point reader is lenient (reads all trailing pairs); files with trailing text after the boundary will still parse but the boundary array may include junk. Contours (from ψ grid) are authoritative in rendering, so visual impact is nil.
- β and β_N use volume-averaged pressure, as does everything else — profile-aware β is a rung-2 concern (TORAX bridge).
