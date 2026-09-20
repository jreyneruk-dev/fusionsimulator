# 07 — User guide

## The layout

```
┌────────────┬──────────────────────────────┬─────────────────┐
│ CONTROLS   │  3-D TORUS                   │  READOUTS       │
│            │  (drag to orbit, scroll      │  T, P_fus, Q,   │
│ presets    │   to zoom, auto-rotates)     │  τ_E, β, triple │
│ geometry   ├──────────────────────────────┤  stability bars │
│ field/cur  │  Run controls                ├─────────────────┤
│ plasma     ├──────────────────────────────┤  CROSS-SECTION  │
│ regime     │  Time chart (T, P_fus)       │  flux surfaces  │
└────────────┴──────────────────────────────┴─────────────────┘
```

## Controls, one by one

### Presets
Six machines at representative operating points: **ITER** (500 MW/Q=10 design), **JET D-T** (the 1997 record pulse), **SPARC** (compact high-field), **ARC** (REBCO-magnet net-electric concept), **NSTX** (spherical tokamak), **DEMO** (power-plant scale). Loading a preset resets the displayed frame.

### Geometry
- **R₀ (major radius)** — donut size. Confinement scales ~R²: this is the most powerful knob. Real machines are big for a reason.
- **a (minor radius)** — tube radius. Sets volume (a²) and the Greenwald limit (a² in the denominator).
- **κ (elongation)** — vertical stretch. Higher κ buys stability and confinement for free-ish (up to ~2.5; above that, vertical control gets hard — not modeled, trust us for now).
- **δ (triangularity)** — D-shapedness. Higher δ raises the Troyon limit in real machines; here it shapes the plasma and slightly shrinks volume.

### Field & current
- **B_t** — the main field. Strong B_t is SPARC/ARC's whole strategy: fusion power density ~β·B⁴ at fixed pressure.
- **I_p (plasma current)** — drives confinement (I_p^0.93 in H-mode), but eats your q95 and Greenwald budget. This tension *is* tokamak engineering.

### Plasma & heating
- **n̄ (density)** — fuel density. Fusion power ~n², but the Greenwald limit caps you.
- **Auxiliary heating** — external MW. Too little and the plasma stays cold; too much and you're just heating radiation.
- **α confinement** — fraction of the 3.5 MeV alphas' energy that actually heats the plasma. Real reactors need ≥0.9.
- **H-factor** — how much better than the empirical scaling your plasma confines (1.0 = average; world-class shots hit 1.2–1.5).
- **Z_eff** — impurities. Watch how fast a "dirty" plasma radiates away your heating.
- **Tritium fraction** — 0.5 is optimal; slide to 0.1 to see why fuel mix matters (P_fus drops ~36%).
- **Regime (auto/L/H)** — auto compares heating against the Martin threshold. Force L or H to see the confinement jump.

### Run controls
- **▶ Run / ⏸ Pause** — the pulse. Physics time advances at the **Speed** multiplier (0.5–20× real time).
- **↺ Reset** — back to the 0.5 keV seed state.
- **steady mode** — knobs constant; watch convergence to thermal equilibrium.
- **scenario mode** — a machine-style pulse: 8 s ramp-up → 30 s flattop → 5 s ramp-down (all knobs scale together, like real pulse programs).
- **Controller** — a PID loop that trims auxiliary heating to hold your **Target T**. Watch it fight the alpha heating once the plasma ignites — this is real feedback-control behavior.

## The readouts

| Metric | Meaning | Good to know |
|---|---|---|
| **Temperature** | volume-averaged, keV | ×11.6 M for Kelvin; 10 keV ≈ 116 MK |
| **Fusion power / Q** | P_fus and its ratio to auxiliary power | Q=∞ displayed when heating is off |
| **τ_E + regime** | confinement time, L/H | H-mode ≈ 2× L-mode at ITER |
| **Triple product** | n·T·τ_E | ignition needs ~30×10²⁰ in these units |
| **β / β_N** | pressure efficiency | β_N>3 trips the Troyon flag |
| **Stability bars** | Greenwald, Troyon, kink | amber = 85% of limit; red = violated (in a real machine: disruption) |

## Guided experiments

1. **Reproduce ITER** — preset ITER → Run → wait ~30 s of sim time. Q settles ~8–12, τ_E ~3.5 s. (Watch the chart: the thermal time constant is seconds — real machines are slow.)
2. **The cliff** — n̄ up to ~1.2: the Greenwald bar goes red. In the sim the plasma survives; in reality, disruption: all stored energy dumps in milliseconds. Feel how close to the edge reactors live.
3. **Alpha-heated** — ITER preset, aux heating to 0. The plasma cools, fusion drops, τ_E shortens — thermal collapse. Now set H-factor 1.3 and try again: some combinations of (n, T) self-sustain. You've discovered ignition margins the hard way.
4. **SPARC vs ITER** — load SPARC: a machine 11× smaller in volume reaching similar Q because B_t = 12.2 T. Slide B_t down to 5: Q collapses. High-field fusion, demonstrated.
5. **Clean vs dirty** — Z_eff 1.2 → 2.5 on ITER: bremsstrahlung quadruples, T and Q fall. Why vacuum systems matter.
6. **Controller stress test** — enable controller, target 20 keV. It slams aux heating to max, overshoots, settles. Lower the target to 6 keV and watch it cut heating entirely as alphas take over.
7. **Your own equilibrium** — solve one in FreeGS (doc 05 has the 6-line script), load the GEQDSK, and compare its flux surfaces with the Miller model at the same R₀/a/κ/δ.

## Troubleshooting

- **Q shows ∞** — that's ignition territory (aux heating ~0 with fusion ongoing). It's a feature.
- **The plasma looks frozen** — check the pulse is running and speed isn't 0.5×; thermal time constants are seconds.
- **"GEQDSK loaded" but contours look odd** — the parser reads the ψ grid; exotic files (EQDSK variants, snapshots mid-discharge) can have unconventional metadata. The Miller view is one click away.
- **Everything went dark red and Q=0** — you paused during ramp-down or turned heating off at low density. Reset and ramp again.
