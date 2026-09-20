"use client";

/**
 * Poloidal cross-section panel: shows Miller-model nested flux surfaces
 * for the current shape, or — when a G-EQDSK file from FreeGS/EFIT is
 * loaded — the real equilibrium flux contours (research ingest path).
 */
import { useMemo, useRef, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { millerCrossSection } from "@/lib/physics/miller";
import { parseGeqdsk, fluxContourSegments, type GeqdskData, type Segment } from "@/lib/physics/geqdsk";

const SIZE = 260;
const PAD = 22;

function toSvg(rz: Array<[number, number]>, rmin: number, rmax: number, zmin: number, zmax: number): string {
  const w = rmax - rmin;
  const h = zmax - zmin;
  const s = Math.min((SIZE - 2 * PAD) / w, (SIZE - 2 * PAD) / h);
  const cx = SIZE / 2 - ((rmin + rmax) / 2) * s;
  const cy = SIZE / 2 + ((zmin + zmax) / 2) * s;
  return (
    rz
      .map(([r, z], i) => `${i ? "L" : "M"}${(r * s + cx).toFixed(1)},${(-z * s + cy).toFixed(1)}`)
      .join(" ") + " Z"
  );
}

function segsToSvg(segs: Segment[], rmin: number, rmax: number, zmin: number, zmax: number): string[] {
  const w = rmax - rmin;
  const h = zmax - zmin;
  const s = Math.min((SIZE - 2 * PAD) / w, (SIZE - 2 * PAD) / h);
  const cx = SIZE / 2 - ((rmin + rmax) / 2) * s;
  const cy = SIZE / 2 + ((zmin + zmax) / 2) * s;
  const f = (p: [number, number]) => `${(p[0] * s + cx).toFixed(1)},${(-p[1] * s + cy).toFixed(1)}`;
  return segs.map(([a, b]) => `M${f(a)} L${f(b)}`);
}

export default function CrossSection() {
  const params = useSim((s) => s.params);
  const [geq, setGeq] = useState<GeqdskData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const miller = useMemo(() => {
    const levels = [0.25, 0.5, 0.75, 1.0];
    return levels.map((rho) => millerCrossSection(params, rho, 64));
  }, [params.R0, params.a, params.kappa, params.delta]); // eslint-disable-line react-hooks/exhaustive-deps

  const contours = useMemo(() => {
    if (!geq) return null;
    const segs = fluxContourSegments(geq, [0.2, 0.4, 0.6, 0.8]);
    const rmin = geq.rleft;
    const rmax = geq.rleft + geq.xdim;
    const zmin = geq.zmid - geq.zdim / 2;
    const zmax = geq.zmid + geq.zdim / 2;
    return segs.map((s) => segsToSvg(s, rmin, rmax, zmin, zmax));
  }, [geq]);

  const millerPaths = useMemo(() => {
    const pts = miller[miller.length - 1];
    const rs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const rmin = Math.min(...rs) - 0.35;
    const rmax = Math.max(...rs) + 0.35;
    const zmin = Math.min(...zs) - 0.35;
    const zmax = Math.max(...zs) + 0.35;
    return {
      paths: miller.map((m) => toSvg(m, rmin, rmax, zmin, zmax)),
      axis: toSvg([[params.R0, 0]], rmin, rmax, zmin, zmax),
    };
  }, [miller, params.R0]);

  async function handleFile(f: File) {
    try {
      const text = await f.text();
      setGeq(parseGeqdsk(text));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to parse G-EQDSK");
      setGeq(null);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Poloidal cross-section
        </div>
        <div className="flex items-center gap-2">
          {geq && (
            <button
              onClick={() => setGeq(null)}
              className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-700"
            >
              use Miller
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-cyan-300 hover:bg-slate-700"
            title="Load a G-EQDSK equilibrium from FreeGS, EFIT, or CHEASE"
          >
            {geq ? "✓ GEQDSK loaded" : "⬆ Load GEQDSK"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".geqdsk,.eqdsk,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block h-56 w-56">
        {geq && contours ? (
          contours.map((segList, i) => (
            <path
              key={i}
              d={segList.join(" ")}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={0.8}
              opacity={0.85}
            />
          ))
        ) : (
          <>
            {millerPaths.paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#22d3ee"
                strokeWidth={i === millerPaths.paths.length - 1 ? 1.4 : 0.8}
                opacity={0.35 + 0.16 * i}
              />
            ))}
          </>
        )}
      </svg>
      <div className="text-center text-[10px] text-slate-500">
        {geq
          ? `Equilibrium: ${geq.nw}×${geq.nh} grid, ψ_axis at R=${geq.rmaxis.toFixed(2)} m`
          : "Miller model nested flux surfaces (ρ = 0.25 … 1)"}
      </div>
      {err && <div className="mt-1 text-center text-[10px] text-rose-400">{err}</div>}
    </div>
  );
}
