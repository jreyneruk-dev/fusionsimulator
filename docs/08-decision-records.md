# 08 — Decision records

Short ADRs capturing the choices that shaped this project, so future-you (or a contributor) knows *why*, not just *what*.

## ADR-01 — 0-D power balance as the physics core

**Decision.** Model the plasma as a single spatial point evolving stored thermal energy `W`; all spatial structure (profiles, flux surfaces, turbulence) is parameterized or omitted.

**Context.** A browser must run the sim interactively; a full transport solve (1-D radial, coupled PDEs) costs orders of magnitude more compute and model complexity.

**Consequences.** Every prediction is a *volume-averaged* statement; the engine can match machine-level benchmarks (τ_E, P_fus, Q) but cannot show sawteeth, ELMs, or profile effects. Documented as the fidelity contract in doc 00.

## ADR-02 — Clean-room TypeScript engine over wrapping research codes

**Decision.** Implement Bosch–Hale, IPB98(y,2), Greenwald, Troyon, Martin, bremsstrahlung, and Ohmic heating from the primary sources in pure TypeScript, rather than compiling Python/C++ codes to WASM or proxying a server-side solver.

**Context.** FreeGS/TORAX are excellent but bring Python/JAX runtimes incompatible with a static Vercel deployment; a proxy server would add hosting cost and latency.

**Consequences.** Full control, zero server, fully documented equations; but the ingest path (ADR-04) exists precisely because we won't outgrow this forever.

## ADR-03 — rAF loop instead of a Web Worker

**Decision.** Run the integration loop on the main thread via requestAnimationFrame, stepping physics between frames.

**Context.** The original plan called for a Worker. Measurement: one 0-D RK4 step is ~2 µs; even at 60 fps × 20× speed the loop uses <1% of a frame. The Worker would only add bundler complexity and structured-clone overhead.

**Consequences.** Simpler code path; a future 1-D transport model would *require* moving to a Worker (noted in doc 04 as the trigger condition).

## ADR-04 — G-EQDSK ingest as the research bridge

**Decision.** Accept G-EQDSK files (FreeGS, EFIT, CHEASE output) to replace the Miller-model cross-section with real equilibrium flux contours.

**Context.** The staged plan (doc 05) wants a rung between "toy shapes" and "full transport": real geometry, cheap compute.

**Consequences.** Users can drop in a FreeGS equilibrium today and see real flux surfaces; geometry-driven physics (volume, q95, Greenwald) still uses Miller parameters, so the GEQDSK is visualization + a fit-source, not yet a physics input. Full coupling is rung 3.

## ADR-05 — Verified-first development, tests as benchmarks

**Decision.** Before writing each physics module, fetch the coefficients from an authoritative source; after writing, lock behavior with tests tied to published machine results (ITER τ_E ≈ 3.59 s, ⟨σv⟩(10 keV) = 1.13616547e-16 cm³/s, etc.).

**Context.** Physics code fails silently and convincingly; a plausible number is worse than an error. The 1-keV table-value incident (doc 06) showed remembered constants are untrustworthy.

**Consequences.** Slower start, but every benchmark band in the test suite traces to a source in doc 06. New physics must come with a benchmark test, by convention.

## ADR-06 — Static Next.js on Vercel, no backend

**Decision.** Next 15 App Router, all simulation client-side, docs baked in as static routes generated from `docs/*.md` at build time.

**Consequences.** Free hosting, instant deploys, versioned docs; the cost is that any future server-side feature (e.g., a shared scenario gallery) changes the hosting story.

## ADR-07 — Scenario mode scales all knobs together

**Decision.** Scenario mode applies a multiplicative factor to heating/current/density via one `scenarioFactor(t)` ramp, rather than independent per-knob trajectories.

**Context.** Real pulse programs do co-modulate most actuators; per-actuator trajectory editing is a UI project in itself.

**Consequences.** One-line scenario definition (8 s rise → 30 s flattop → 5 s fall); a trajectory editor is listed as future work.

## ADR-08 — PID trims only auxiliary heating

**Decision.** The auto-controller adjusts `pAuxMW` only, holding geometry/field/density fixed.

**Context.** In real machines, actuators are actuator-limited too; P_aux is the fastest, least-constrained knob. Multi-actuator MPC is research-grade control.

**Consequences.** The controller cannot save a plasma that violates stability limits — it fights temperature swings, not disruptions. This is honest: watch β_N exceed 3 with the controller on and nothing can stop it, which is exactly what happens in the real world (except with faster thermal quench).
