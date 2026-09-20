# 04 — Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | SSR for the docs pages, client-only for the Canvas scene |
| Language | TypeScript, strict | Physics code needs type safety more than most |
| State | zustand | Tiny store; selectors prevent re-render storms from 60 fps updates |
| 3-D | react-three-fiber + drei + three | Declarative three.js; auto-orbit, stars, damping for free |
| Charts | Hand-rolled SVG | Two polylines didn't justify a chart library |
| Styling | Tailwind v4 | Fast iteration, dark-lab theme |
| Tests | Vitest | Fast, ESM-native, path aliases |

## Module map

```
src/
├─ lib/
│  ├─ physics/            ← the engine: pure TS, ZERO dependencies, no DOM
│  │  ├─ types.ts         interfaces: TokamakParams, PlasmaState, SimFrame, LimitStatus
│  │  ├─ constants.ts     E_FUS, ALPHA_SHARE, KEV_TO_J, C_BREM
│  │  ├─ bosch-hale.ts    ⟨σv⟩(T)  — Bosch-Hale 1992, Table VII
│  │  ├─ confinement.ts   IPB98(y,2), ITER89-P, Martin P_LH
│  │  ├─ radiation.ts     bremsstrahlung
│  │  ├─ ohmic.ts         Spitzer resistivity
│  │  ├─ miller.ts        geometry: volume, κ_IPB, q95, surface points
│  │  ├─ limits.ts        Greenwald, Troyon, kink → LimitStatus[]
│  │  ├─ power-balance.ts the ODE + RK4 + fixed-point τ_E + regime logic
│  │  ├─ scenario.ts      waveform + PID
│  │  ├─ presets.ts       ITER/JET/SPARC/ARC/NSTX/DEMO
│  │  └─ geqdsk.ts        G-EQDSK parser + flux contours
│  └─ sim/
│     └─ store.ts         zustand store + rAF loop + history ring
├─ app/                   pages (dashboard, docs)
└─ components/
   ├─ controls/           Sliders, RunControls
   ├─ charts/             Readouts, HistoryChart
   └─ torus/              TorusScene (3-D), CrossSection (2-D inset)
```

**The one rule that matters:** `lib/physics` imports nothing but its own siblings. It has no React, no browser API, no Three.js. That's what makes it unit-testable in Node and portable into a Worker, CLI, or research pipeline unchanged.

## Data flow

```
User drags slider
      │
      ▼
useSim.setParam() ──► zustand store (params)
                              │
              rAF loop (store.ts) every frame:
                              │
      ┌───────────────────────┤
      │  1. read params                (state)
      │  2. apply scenario waveform    (scaleParams)
      │  3. apply controller trim      (PID on T)
      │  4. step physics:              pbStep(state, eff, simDt)
      │       └─ balance(W): fusion, alpha, ohmic, brem,
      │          fixed-point τ_E(P_L), dW/dt
      │       └─ RK4 sub-steps (dt ≤ 5 ms sim time)
      │  5. write lastFrame + history ring (600 pts @ ≥20 Hz)
      ▼
React components subscribe via selectors:
  Readouts ← lastFrame         Sliders ← params
  HistoryChart ← history       TorusScene ← params + lastFrame (via useFrame)
```

The 3-D scene reads the store **inside useFrame** (imperative), not through React props — a 60 fps React re-render of the whole tree would drop frames; mutating material emissive colors does not.

## Key design decisions

- **Why no Web Worker?** The 0-D step costs ~2 µs (one temperature, ~30 fixed-point iterations of a power law). Dispatching to a Worker costs more than the compute. ADR-003 documents the flip: if the TORAX bridge or profile evolution lands, the loop moves to a Worker with the same store interface.
- **RK4 with fixed sub-steps.** The τ_E(P_L) fixed point makes dW/dt non-smooth below ~1e-3 MW; fixed small steps keep it robust without adaptive-step machinery.
- **Frame consistency.** The frame reported to the UI is re-evaluated at the *final* W after all sub-steps, so `W = P_loss·τ_E` holds exactly in every displayed number (enforced by test).
- **History ring** capped at 600 points (~30 s at default sampling) keeps memory flat over hours of running.

## Testing strategy

Physics correctness is enforced by `test/physics/`:

1. **Spot values** — Bosch–Hale at 10 keV against the reference (1.13616547e-22 m³/s, 5 significant digits).
2. **Independent path** — closed-form fit vs numerical Maxwellian integration of the cross-section (<1% at 5 temperatures).
3. **Device benchmarks** — ITER τ_E from IPB98(y,2); Martin threshold; Greenwald density formula.
4. **Scenario integration** — run ITER 40 s of sim time: Q lands 5–15, energy closes <5%, W = P_loss·τ_E <2%, H-mode active.
5. **Trip tests** — push past Greenwald, the danger flag must appear.
6. **Parser tests** — synthetic G-EQDSK with correct Fortran formatting.

Run: `npm test`. Typecheck: `npm run typecheck`.

## Adding a physics model

1. Create `lib/physics/your-model.ts` (pure function, units in the docstring, citation in the header).
2. Wire it into `power-balance.ts` (or `limits.ts`) at the smallest reasonable seam.
3. Add a benchmark test with a published number before wiring UI.
4. Document it in doc 03 with the same rigor (equation, units, validity, citation).
