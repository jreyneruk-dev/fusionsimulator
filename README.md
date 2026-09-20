# Fusion Torus Simulator

An interactive, browser-based **tokamak plasma physics playground**. Tune the magnetic field, plasma current, density, heating power and machine geometry with sliders, and watch a glowing 3-D torus respond in real time while a physically-grounded 0-D engine computes confinement, fusion power, energy gain **Q**, and stability limits.

Everything runs client-side — no backend, no GPU required. Deployable to Vercel in one command.

![status](https://img.shields.io/badge/physics_tests-28%2F28_passing-brightgreen)

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm test             # physics engine benchmarks (28 tests)
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

Deploy to Vercel:

```bash
npx vercel           # or push to GitHub and import at vercel.com
```

## The 30-second tour

1. Open the simulator. **ITER** is preloaded.
2. Press **▶ Run**. Watch temperature climb, the torus brighten from red to white-hot, and Q rise toward **~10** — ITER's design target.
3. Push **Density n̄** past ~1.0. The **Greenwald density** flag goes amber, then red — you are over the operational limit.
4. Switch to **scenario mode** and watch a full pulse: ramp-up → flattop → ramp-down.
5. Turn on the **controller** and give it a temperature target — the PID trims auxiliary heating to hold it.
6. Got an equilibrium file from [FreeGS](https://github.com/freegs-plasma/freegs) or EFIT? Load it in the **cross-section** panel to render real flux surfaces.

## What's inside

| Path | Contents |
|---|---|
| `src/lib/physics/` | Pure-TypeScript 0-D physics engine (zero dependencies) |
| `src/lib/sim/` | Simulation store + loop |
| `src/components/` | UI: sliders, readouts, charts, 3-D torus, cross-section |
| `src/app/docs/` | In-app rendered documentation |
| `docs/` | The full documentation trail (below) |
| `test/physics/` | Vitest benchmarks against published physics |

## Documentation trail

| Doc | What it covers |
|---|---|
| [00 — Overview](docs/00-overview.md) | What this is, who it's for, design philosophy |
| [01 — Roadmap](docs/01-roadmap.md) | Build phases with acceptance criteria and status |
| [02 — Fusion ABC](docs/02-fusion-abc.md) | Beginner's guide: fusion, tokamaks, Lawson, Q, H-mode — no physics background needed |
| [03 — Physics model](docs/03-physics-model.md) | Every equation in the engine, with units, validity, and citations |
| [04 — Architecture](docs/04-architecture.md) | Software design, module map, data flow, testing strategy |
| [05 — Research options](docs/05-research-options.md) | Survey of simulation approaches & open-source codes (TORAX, FreeGS, …) and the upgrade path |
| [06 — Research log](docs/06-research-log.md) | The deep-research trail behind the engine: sources, verifications, decisions |
| [07 — User guide](docs/07-user-guide.md) | How to drive the simulator; guided experiments |
| [08 — Decision records](docs/08-decisions.md) | ADRs: stack choice, fidelity level, ingest strategy |

The same docs are readable in-app at **/docs**.

## Scientific integrity

The engine implements published, peer-reviewed models — no invented physics:

- **Bosch & Hale** D-T reactivity (Nucl. Fusion 32, 1992) — verified against independent numerical integration to <1%
- **IPB98(y,2)** / **ITER89-P** confinement scalings (Nucl. Fusion 39, 1999 / 30, 1990) — reproduces ITER τ_E ≈ 3.6 s
- **Martin** L-H threshold (2008 ITPA database), **Greenwald** density limit (Nucl. Fusion 28, 1988), **Troyon** β-limit (PPCF 26, 1984)

All unit benchmarks live in `test/physics/`. A 0-D model is the same first-pass tool real reactor design teams use — it is *not* a substitute for transport codes like TORAX (see doc 05 for the staged upgrade path, which this app already supports via GEQDSK ingest).

## License

MIT.
