# 05 — Research options: the fidelity ladder

This app sits on rung 2 of a ladder that the fusion community climbs with supercomputers. This doc maps the whole ladder — what each level costs, what it buys, and which open-source codes live there — so future upgrades are informed choices rather than vibes.

## The ladder

| Rung | Model | What it captures | Compute | Codes |
|---|---|---|---|---|
| 0 | Hand analysis (Lawson criterion) | Does the concept violate physics? | paper | — |
| **1** | **0-D power balance** ← **this app** | Global energy balance, ignition margins, Q, τ_E trends, operational limits | microseconds | PROCESS (systems code, same spirit) |
| 2 | 1-D radial transport | Temperature/density *profiles*, current diffusion, sawteeth | seconds–minutes | **TORAX** (DeepMind, JAX), RAPTOR, ASTRA |
| 3 | 2-D MHD equilibrium | Real plasma shapes, X-points, free-boundary equilibria, coil design | seconds | **FreeGS**, EFIT, CHEASE, VMEC (3-D) |
| 4 | Linear stability / MHD spectroscopy | Which instabilities grow, growth rates | minutes–hours | MARS-F, ILSA |
| 5 | Nonlinear MHD & disruptions | ELMs, tearing modes, disruption dynamics | hours–days | JOREK, M3D-C1 |
| 6 | Gyrokinetic turbulence | First-principles heat flux (what τ_E *really* comes from) | hours–weeks on HPC | GENE, GYSELA, GS2 |
| 7 | Kinetic / PIC | Kinetic instabilities, RF heating, edge kinetic physics | frontier-scale | XGC, EUTERPE |

Each rung subsumes the one below: TORAX needs an equilibrium (rung 3) and validates against τ_E scalings (rung 1). The app's staged architecture (doc 04) is designed to ingest rungs 2–3 without disturbing rung 1.

## What we built on

- **Bosch & Hale 1992** (Nucl. Fusion 32, 611) — the standard D-T reactivity parameterization. Our implementation was verified against **PlasmaPy**'s tested version and against direct numerical integration of the cross-section.
- **IPB98(y,2)** (ITER Physics Basis, Nucl. Fusion 39, 1999) — the confinement workhorse; form and units cross-checked against **PROCESS**'s documentation (UKAEA).
- **ITER89-P** (Yushmanov 1990), **Martin 2008** L-H threshold, **Greenwald 1988**, **Troyon 1984** — all as cited in doc 03.

## The ingest path (implemented)

**G-EQDSK files** (rung 3): the cross-section panel accepts real equilibria from [FreeGS](https://github.com/freegs-plasma/freegs) (pip installable, runs on a laptop), EFIT (DIII-D/NSTX reconstructions), or CHEASE. Example with FreeGS:

```python
# python-side
import freegs
machine = freegs.machine.TestApplication()
eq = freegs.solve(machine, profiles=..., constraints=...)
from freegs import geqdsk
with open("my.geqdsk", "w") as f:
    geqdsk.write(eq, f)
```

Load `my.geqdsk` in the app → nested flux surfaces from a real Grad–Shafranov solve replace the Miller model. The parser handles the Fortran quirks (integer right-portion editing, 16-char exponent columns).

## The TORAX bridge (designed, v2)

[TORAX](https://github.com/google-deepmind/torax) (DeepMind) is a differentiable 1-D transport simulator in JAX — pip installable, runs on a laptop CPU (its NN transport surrogate QLKNN is tiny). The planned bridge:

1. **Profiles out → viz in.** TORAX writes netCDF state files; we add an importer that renders T(r), n(r), q(r) profiles as overlay curves in the cross-section panel, plus τ_E and P_fus overlays on the time chart.
2. **Scenario round-trip.** Export our scenario ramps as TORAX config perturbations; run TORAX headless; import the higher-fidelity answer for the same pulse.
3. **What it buys:** profiles, current diffusion, pedestal, sawteeth — everything a 0-D model averages away.
4. **Why not now:** a real TORAX run is needed to validate the importer; shipping an untested bridge would violate the "no invented physics" rule. The schema is in doc 04; the work is a `netcdf` reader (browser: `netcdfjs`) + normalization + plotting.

## Other codes worth knowing (not integrated)

| Code | What | Laptop? | Interesting because |
|---|---|---|---|
| [FreeGS](https://github.com/freegs-plasma/freegs) | Free-boundary Grad–Shafranov (Python) | ✅ | Equilibrium files this app already eats |
| [OpenFUSIONToolkit / TokaMaker](https://github.com/OpenFUSIONToolkit) | FEM equilibria, mesh-based | ✅ (slow) | Full equilibrium workflows, stellarators |
| [CHEASE](https://crppwww.epfl.ch/~hkcl/source_code.html) | Fixed-boundary equilibrium (Fortran) | ✅ | The classic; produces EQDSK for TORAX |
| [FusionCpp](https://github.com/Amineharrabi/FusionCpp) | 3-D particle + raytraced tokamak (C++/GLSL) | GPU | The visual-spectacle end of the spectrum |
| [fusionsimulator.io](https://fusionsimulator.io) | Browser 0-D + analytic equilibria | — | Nearest existing project to this one; ours adds scenario/controller mode, presets, GEQDSK ingest, and a documented engine |
| [OMAS/OMFIT](https://omas.io) | Data orchestration for fusion | ✅ | Standardized I/O — how a serious TORAX bridge would ship data |
| GENE/GYSELA | Gyrokinetic turbulence | ❌ HPC | Where τ_E scalings come *from* (QLKNN is their NN distillation) |
| [QLKNN](https://gitlab.com/qualikiz-group/qlknn-hyper) | NN surrogate of QuaLiKiz | ✅ (inference) | The transport model inside TORAX — rung 6 physics at rung-2 cost |

## If we ever wanted "more real" in-browser

1. **Profiles (rung 2 lite):** evolve T(ρ) on a 30-point radial grid with a stiff diffusion closure — 10× the compute, still browser-fine. This is the biggest honest upgrade available client-side.
2. **QLKNN in ONNX:** run the turbulence surrogate directly in the browser via onnxruntime-web. Ambitious but genuinely feasible — this is the path to "real transport in your browser."
3. **Fast-ion orbits:** integrate guiding-center drift equations for the alpha population instead of using f_α (rung 4.5, pretty and educational).
4. **Disruption simulation (rung 5):** not feasible in-browser; the flags stay flags.

The guiding principle stays: **every number the app shows must trace to a published model or a loaded research file.** Nothing invented, nothing hidden.
