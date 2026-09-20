# 01 — Roadmap

Canonical status tracker for the build. Checkboxes are updated as work completes.

## Phase 1 — Research & verification ✅

- [x] Survey the landscape (fusionsimulator.io, FusionCpp, FreeGS, TORAX, PROCESS)
- [x] Select fidelity point: 0-D power balance + analytic geometry + ingest path
- [x] Verify Bosch–Hale Table VII coefficients against PlasmaPy's tested implementation
- [x] Independent verification: Maxwellian integration of the Bosch–Hale cross-section (agreement <1% at all reference temperatures)
- [x] Verify IPB98(y,2) form/units from UKAEA PROCESS documentation
- [x] Verify Martin L-H threshold coefficients from the 2008 ITPA database publication
- [x] Benchmark sanity: model reproduces ITER τ_E ≈ 3.6 s and Q ≈ 10 operating point

## Phase 2 — Physics core ✅

- [x] `bosch-hale.ts` — D-T reactivity ⟨σv⟩(T), cm³/s→m³/s conversion documented
- [x] `confinement.ts` — IPB98(y,2), ITER89-P, Martin threshold
- [x] `radiation.ts` — bremsstrahlung with Z_eff enhancement
- [x] `ohmic.ts` — Spitzer resistivity (Te in eV)
- [x] `miller.ts` — volume, κ_IPB, q95, 2-D/3-D flux surfaces
- [x] `limits.ts` — Greenwald, Troyon β_N, kink q95 with severity classification
- [x] `power-balance.ts` — dW/dt ODE, RK4, τ_E fixed-point (contraction-aware iteration count), regime logic
- [x] `presets.ts` — ITER, JET, SPARC, ARC, NSTX, DEMO operating points
- [x] `scenario.ts` — pulse waveform + PID controller
- [x] `geqdsk.ts` — G-EQDSK parser + marching-squares flux contours
- [x] Test suite: 28 tests, all passing (spot values, ITER scenario, energy closure, limit trips)

## Phase 3 — Dashboard UI ✅

- [x] zustand store + rAF simulation loop (sub-2µs steps make a Worker unnecessary — see ADR-003)
- [x] Slider panel: geometry, field/current, plasma/heating with unit-aware formatting
- [x] Presets picker, regime selector (auto/L/H)
- [x] Run controls: play/pause, speed (0.5–20×), mode, reset
- [x] Readouts: T, P_fus, Q, τ_E, triple product, β/β_N, heating balance
- [x] Stability limit bars with warn/danger thresholds
- [x] SVG time-series chart (T and P_fus history)

## Phase 4 — 3-D torus scene ✅

- [x] Miller-surface plasma torus with temperature-driven emissive color
- [x] Ignition flash when Q crosses 5
- [x] Helical field lines with q-proportional winding
- [x] Guiding-center particle layer (320 particles, q-coupled poloidal/toroidal drift)
- [x] Vacuum vessel + TF coil rings, starfield, auto-orbit camera

## Phase 5 — Scenario mode & controller ✅

- [x] Waveform generator: ramp-up → flattop → ramp-down (simulated-time based)
- [x] PID auto-controller on temperature with anti-windup, trimming auxiliary power

## Phase 6 — Research ingest ✅ (v1)

- [x] G-EQDSK parser (Fortran quirks handled: integer right-portion editing, 16-char float columns)
- [x] Cross-section panel renders real equilibrium flux contours
- [ ] TORAX bridge: netCDF profile importer (see doc 05 for the design; requires a real TORAX run to test against — flagged for v2)

## Phase 7 — Docs, CI & deploy ✅

- [x] Documentation suite (docs 00–08) + in-app /docs pages
- [x] GitHub Actions CI: typecheck + tests + build
- [x] Deployed to Vercel: https://fusion-torus-simulator.vercel.app (project linked via CLI, `vercel.json` pins legacy-peer-deps install)
- [ ] Custom domain + Lighthouse pass (post-deploy polish)

## Acceptance criteria (met)

1. **ITER preset reaches Q ≈ 10 ± 3 at steady state** — enforced by test.
2. **Energy closes**: heating = losses within 5% at steady state — enforced by test.
3. **Limit trips are visible**: exceeding Greenwald shows danger state — enforced by test.
4. **All physics benchmarks pass** — 28/28.
5. **Typecheck and production build clean.**
