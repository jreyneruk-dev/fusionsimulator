/**
 * Minimal G-EQDSK parser (equilibrium input/output format from the
 * National Transport Code Collaboration / fusion research codes such as
 * FreeGS, EFIT, CHEASE).
 *
 * Format (G-EQDSK, iterative FORTRAN text):
 *   Header: 6 lines (description, dims). Integers may use right-portion
 *   editing: "3   2" means 32 — we parse with that quirk.
 *   Then: dimensions nw,nh; then xdim/zdim; then psi boundaries; then
 *   arrays in 5E16.9 format: fpol(1,mw), pres(1,mw), ffprim, pprime,
 *   psirz(nh,nw), qpsi, boundary points.
 *
 * We extract what the visualizer needs: nw, nh, xdim, zdim, rleft,
 * zmid, psi grid, R/Z of magnetic axis, psi at axis and boundary.
 * Units per G-EQDSK convention: psi in Wb/rad, R,Z in meters.
 */

export interface GeqdskData {
  nw: number;
  nh: number;
  xdim: number;
  zdim: number;
  rleft: number;
  zmid: number;
  /** Poloidal flux on grid [Wb/rad], rows = z, cols = r */
  psirz: number[][];
  /** psi on axis and boundary [Wb/rad] */
  simagx: number;
  sibry: number;
  /** R of magnetic axis [m] */
  rmaxis: number;
  /** Z of magnetic axis [m] */
  zmaxis: number;
  /** Safety factor profile on flux grid (length mw) */
  qpsi: number[];
  /** f=RBt on flux grid (length mw) */
  fpol: number[];
  /** Plasma boundary [R,Z] pairs if present */
  boundary: Array<[number, number]>;
}

/** Parse the integer-pair "right portion editing" quirk. */
function parseEqdskInt(token: string): number {
  const parts = token.trim().split(/\s+/);
  if (parts.length < 2) return parseInt(token, 10);
  // "3   2" -> 32
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  if (!isNaN(a) && !isNaN(b)) return a * 10 + b;
  return parseInt(token, 10);
}

/**
 * Parse a G-EQDSK text file into structured data.
 * Throws on grossly malformed headers.
 */
export function parseGeqdsk(text: string): GeqdskData {
  const lines = text.split(/\r?\n/);
  if (lines.length < 8) throw new Error("File too short for G-EQDSK");
  // Line 2 holds nw, nh (with the editing quirk)
  const dimsLine = lines[1];
  const nw = parseEqdskInt(dimsLine.slice(0, 4));
  const nh = parseEqdskInt(dimsLine.slice(4, 8));
  if (!(nw > 0 && nh > 0 && nw < 1000 && nh < 1000)) {
    throw new Error(`Unreasonable grid dimensions ${nw}x${nh}`);
  }

  // Lines 4 (0-indexed 3) hold xdim zdim rleft zbottom
  const l4 = lines[3].trim().split(/\s+/).map(parseFloat);
  const xdim = l4[0];
  const zdim = l4[1];
  const rleft = l4[2];
  const zmid = l4[3] + zdim / 2; // file stores z of bottom-left corner
  // line 5: rmaxis zmaxis simagx sibry
  const l5 = lines[4].trim().split(/\s+/).map(parseFloat);
  const rmaxis = l5[0];
  const zmaxis = l5[1];
  const simagx = l5[2];
  const sibry = l5[3];

  // All following numbers flow as one stream (5E16.9 format per line,
  // but wrapped arbitrarily by some writers): collect from line 7 on.
  const nums: number[] = [];
  for (let i = 6; i < lines.length; i++) {
    const ln = lines[i];
    for (let j = 0; j + 16 <= ln.length + 16; j += 16) {
      const tok = ln.slice(j, j + 16).trim();
      if (tok === "") break;
      const v = parseFloat(tok);
      if (!isNaN(v)) nums.push(v);
    }
  }

  let pos = 0;
  const take = (n: number): number[] => {
    const out = nums.slice(pos, pos + n);
    pos += n;
    return out;
  };

  const fpol = take(nw);
  const pres = take(nw);
  const ffprim = take(nw);
  const pprime = take(nw);
  const psirzFlat = take(nw * nh);
  const qpsi = take(nw);
  const remaining = nums.length - pos;

  // psirz rows = z (nh), cols = r (nw)
  const psirz: number[][] = [];
  for (let iz = 0; iz < nh; iz++) {
    psirz.push(psirzFlat.slice(iz * nw, (iz + 1) * nw));
  }

  // Boundary: pairs follow; take up to 200 points if present
  const boundary: Array<[number, number]> = [];
  if (remaining >= 2) {
    const bpts = Math.min(Math.floor(remaining / 2), 400);
    for (let i = 0; i < bpts; i++) {
      const r = nums[pos + 2 * i];
      const z = nums[pos + 2 * i + 1];
      if (isFinite(r) && isFinite(z)) boundary.push([r, z]);
    }
  }

  // Silence unused-var lint for pres/ffprim/pprime (kept for completeness)
  void pres; void ffprim; void pprime;

  return { nw, nh, xdim, zdim, rleft, zmid, psirz, simagx, sibry, rmaxis, zmaxis, qpsi, fpol, boundary };
}

/**
 * Extract normalized-flux contour(s) ψ* = const as line segments in (R,Z).
 * Uses marching-squares per-cell edge crossing; segments are returned
 * unjoined, which is ideal for rendering as many tiny line segments
 * (no contour-joining pass needed for an overlay).
 *
 * @returns for each level, an array of segments [[R1,Z1],[R2,Z2]]
 */
export type Segment = [[number, number], [number, number]];

export function fluxContourSegments(
  g: GeqdskData,
  levels: number[] = [0.2, 0.4, 0.6, 0.8]
): Segment[][] {
  const out: Segment[][] = [];
  const { psirz, nw, nh } = g;
  const psiAx = g.simagx;
  const psiBd = g.sibry;
  const norm = (v: number) => (v - psiAx) / Math.max(psiBd - psiAx, 1e-12);
  const zmin = g.zmid - g.zdim / 2;
  const rAt = (i: number) => g.rleft + (i * g.xdim) / (nw - 1);
  const zAt = (j: number) => zmin + (j * g.zdim) / (nh - 1);

  for (const lvl of levels) {
    const segs: Segment[] = [];
    for (let j = 0; j < nh - 1; j++) {
      for (let i = 0; i < nw - 1; i++) {
        const v00 = norm(psirz[j][i]);
        const v10 = norm(psirz[j][i + 1]);
        const v01 = norm(psirz[j + 1][i]);
        const v11 = norm(psirz[j + 1][i + 1]);
        if (lvl < Math.min(v00, v10, v01, v11) || lvl > Math.max(v00, v10, v01, v11)) continue;
        const interp = (va: number, vb: number, ra: number, za: number, rb: number, zb: number): [number, number] => {
          const u = (lvl - va) / (vb - va);
          return [ra + u * (rb - ra), za + u * (zb - za)];
        };
        const edges: Array<[number, number]> = [];
        if ((v00 < lvl) !== (v10 < lvl)) edges.push(interp(v00, v10, rAt(i), zAt(j), rAt(i + 1), zAt(j)));
        if ((v10 < lvl) !== (v11 < lvl)) edges.push(interp(v10, v11, rAt(i + 1), zAt(j), rAt(i + 1), zAt(j + 1)));
        if ((v11 < lvl) !== (v01 < lvl)) edges.push(interp(v11, v01, rAt(i + 1), zAt(j + 1), rAt(i), zAt(j + 1)));
        if ((v01 < lvl) !== (v00 < lvl)) edges.push(interp(v01, v00, rAt(i), zAt(j + 1), rAt(i), zAt(j)));
        for (let e = 0; e + 1 < edges.length; e += 2) {
          segs.push([edges[e], edges[e + 1]]);
        }
      }
    }
    out.push(segs);
  }
  return out;
}

/** Convenience: default normalized levels for display. */
export const DEFAULT_CONTOUR_LEVELS = [0.2, 0.4, 0.6, 0.8];
