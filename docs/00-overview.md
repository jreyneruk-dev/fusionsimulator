# 00 — Overview

## What this is

The **Fusion Torus Simulator** is an interactive playground for exploring magnetic confinement fusion in a browser. You control the knobs of a tokamak — major radius, magnetic field, plasma current, density, heating power — and a physics engine grounded in published fusion science computes what happens: how hot the plasma gets, how much fusion power it produces, whether it ignites, and which stability limits it trips.

A 3-D torus renders the machine: an emissive plasma that shifts from dull red to white-hot as temperature rises, helical magnetic field lines whose winding reflects the safety factor, particles tracing guiding-center orbits, and a flash when the plasma ignites.

## Who it's for

- **The curious** — if you've wondered what "Q=10" or "Lawson criterion" means, the ABC guide (doc 02) and the simulator make it tangible.
- **Students** — every equation is documented (doc 03) with units and citations; the tests show how physics code is verified.
- **Educators** — presets for ITER, JET, SPARC, ARC, NSTX and DEMO make lecture demos one click.
- **Fusion enthusiasts** — push the machine past the Greenwald limit, try to hold ignition with zero heating, or see whether SPARC really reaches Q≈10 in a 0-D world.

## Design philosophy

1. **Playground first.** The goal is intuition: dragging the B-field slider should *teach* something. Every parameter responds in real time.
2. **Real physics, honest fidelity.** We implement published models exactly (Bosch–Hale, IPB98(y,2), Martin, Greenwald, Troyon) and are equally explicit about what a 0-D model *cannot* do (doc 05). No invented physics, no fake precision.
3. **Own the core, ingest the rest.** The 0-D engine is clean-room TypeScript — auditable, testable, dependency-free. Where research-grade fidelity is wanted (equilibrium shapes), we *ingest* files from established codes (FreeGS, EFIT, CHEASE) rather than reimplement them.
4. **Docs are part of the product.** This trail was written alongside the code — the research log (doc 06) records how the constants were verified, warts and all.
5. **Runs anywhere.** Client-side only, no GPU, no backend. If it can run a browser, it can model a star.

## What it is not

This is not a design tool for building a reactor, and it is not a research transport code. The 0-D model treats the plasma as a single lumped volume; it cannot represent turbulence, profiles, ELMs, or MHD instabilities beyond limit checks. Doc 05 maps the full ladder of simulation fidelity and where each open-source code sits, including the TORAX bridge for those who want to go deeper.
