# 02 — Fusion ABC: a beginner's guide

*No physics background needed. Read this, then play with the simulator and everything will click.*

## What is fusion?

Fusion is the energy source of the stars: **light atomic nuclei merge into heavier ones, releasing enormous energy** because the combined nucleus weighs slightly *less* than its parts — the missing mass becomes energy (E = mc²).

The easiest fusion reaction on Earth uses two heavy forms of hydrogen:

```
Deuterium + Tritium  →  Helium (3.5 MeV)  +  Neutron (14.1 MeV)
   D            T            α                n          total 17.6 MeV
```

- **Deuterium** is in seawater (1 in ~6400 hydrogen atoms).
- **Tritium** is rare but can be bred from lithium inside the reactor blanket.
- The **neutron** carries 80% of the energy out of the plasma (that's what heats the power plant), while the **alpha particle** (helium nucleus) stays charged and can heat the plasma itself — this *self-heating* is the key to ignition.

## Why is it hard? The Coulomb wall

Nuclei are all positively charged, and like charges repel. To fuse, two nuclei must slam into each other hard enough to tunnel through that electric repulsion ("quantum tunneling" — the same effect as a ball appearing on the other side of a wall, rarely). The remedy: **heat the fuel to over 100 million degrees**. At that temperature, atoms are stripped of electrons, and matter becomes a **plasma** — an electrically-charged gas.

At 150 million K, the D-T mixture is **ten times hotter than the Sun's core**. We can do that; the Sun compensates for its low temperature with immense gravity and size — we can't, so we go hotter.

## No container can hold it — so use a magnetic bottle

A 150-million-degree plasma vaporizes any material wall. But charged particles in a magnetic field spiral along field lines like beads on invisible wires. Shape the field into a **donut (torus)** and particles run around it forever — in principle.

A **tokamak** (Russian: *toroidal'naya kamera s magnitnymi katushkami* — toroidal chamber with magnetic coils) is the leading design:

- **Toroidal field coils** (the ring around the torus) create the main field *around* the donut.
- **The plasma current** (the plasma acts as its own electromagnet, tens of mega-amps) creates a second field *around the tube*.
- Together the fields twist into **helical lines** — essential, because a purely toroidal field lets particles drift up/down out of the donut. The twist "washes out" that drift.

The **safety factor q** counts how many toroidal loops a field line makes per poloidal loop. Too much current → q too low → the plasma kinks like an over-twisted phone cord. The simulator flags this.

## The Lawson criterion: the price of net power

Fusion has to produce more energy than the plasma loses. Hot plasma loses energy by:
- **Radiation** (bremsstrahlung — light emitted when electrons bend near ions),
- **Transport** — particles and heat leaking out to the wall.

Pack the fuel dense enough, hot enough, and keep it hot long enough, and alpha self-heating wins. The famous **triple product** bundles the three requirements:

```
n · T · τ_E  ≥  ~3×10²¹ keV·s/m³    (for ignition)
```

- **n** — density (how tightly packed the fuel is)
- **T** — temperature (~10–20 keV; 1 keV ≈ 11.6 million K)
- **τ_E** — **energy confinement time**: how long the plasma keeps its heat if the heating is switched off. Think of a thermos: a great thermos has a long τ_E.

The simulator shows your live triple product. ITER's design point is about 3.4×10²⁰ in these normalized units — a factor of ~10 short of ignition, which is why it still needs 50 MW of external heating.

## Q — the scoreboard

```
Q = (fusion power produced) / (external heating power fed in)
```

| Q | Meaning |
|---|---|
| Q = 1 | **Breakeven** — fusion equals external heating |
| Q = 5 | Alpha heating dominates |
| Q = 10 | ITER's design target |
| Q = ∞ | **Ignition** — the plasma heats itself; heating off |

JET holds the record Q ≈ 0.67 (1997). NIF reached target gain >1 in 2022 by a different route (lasers, inertial confinement). No magnetic device has yet passed Q=2 — SPARC (Q≈10 target) and ITER are designed to change that.

## Confinement modes: L and H

Plasma transport isn't fixed — it's empirical, like weather. Two regimes:

- **L-mode** ("low"): ordinary confinement.
- **H-mode** ("high"): discovered 1982 on ASDEX; above a certain heating power the plasma spontaneously forms an insulating "pedestal" at its edge and confinement roughly **doubles**. Every modern reactor design assumes H-mode.

The simulator switches regimes automatically using the **Martin scaling** for the required threshold power. Watch the regime indicator flip as you crank the heating.

## Why the torus glows (in the simulator)

Real plasmas at 100 MK emit almost no visible light (too hot — the glow you see in photos is the cooler edge). In the simulator, the torus brightness maps temperature and fusion rate, and particles trace the helical orbits — it's an *instrument*, not a photograph.

## Where the limits bite

A tokamak has hard operating boundaries — the simulator shows all three live:

1. **Greenwald density limit** — exceed it and the plasma suddenly dumps all its energy (a *disruption*). Roughly `n_max = I_p / (π a²)`.
2. **Troyon beta limit** — pressure can't exceed a fraction of the magnetic pressure; push too hard and the plasma bulges and breaks the field.
3. **Kink limit (q95 < 2)** — too much current for the field to hold; the whole column twists apart.

## Suggested first experiments

1. Load **ITER**, press Run, watch Q approach 10.
2. Cut **auxiliary heating** to zero — can alpha heating hold the plasma? (Watch τ_E and T collapse.)
3. Raise **density** until the Greenwald bar turns red.
4. Drop **plasma current** below ~5 MA and watch the kink flag and the field-line twist change.
5. Try **NSTX** — a squat "spherical" tokamak that gets clever confinement from a fat core.

When you're ready for the equations behind all this, read [doc 03 — the physics model](03-physics-model.md).
