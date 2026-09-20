"use client";

/**
 * The 3-D tokamak. React-three-fiber scene:
 * - emissive plasma torus whose color/temperature tracks the 0-D state
 * - helical magnetic field lines (q-proportional winding)
 * - guiding-center particle display layer
 * - vacuum vessel + TF coil rings
 * - ignition flash when Q exceeds ~5
 *
 * If WebGL is unavailable or the context is lost, an animated SVG
 * fallback (same physics colors, same geometry) renders instead, so the
 * simulator never shows a silent black box. A small badge in the corner
 * reports the detected GPU renderer for diagnostics.
 *
 * Geometry uses the Miller model from lib/physics at ρ=1.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { millerSurfacePoint, q95, type MillerParams } from "@/lib/physics/miller";

/** meters → scene units (keep ITER ~ size 8) */
const SCALE = 0.55;

function tempColor(T: number): THREE.Color {
  // deep red → orange → white-hot → blue-white
  const c = new THREE.Color();
  if (T < 2) c.setRGB(0.35, 0.05, 0.02);
  else if (T < 5) c.setRGB(0.9, 0.25, 0.05).lerp(new THREE.Color(1, 0.55, 0.1), (T - 2) / 3);
  else if (T < 12) c.setRGB(1, 0.55, 0.1).lerp(new THREE.Color(1, 0.95, 0.8), (T - 5) / 7);
  else c.setRGB(1, 0.95, 0.8).lerp(new THREE.Color(0.75, 0.85, 1), Math.min((T - 12) / 15, 1));
  return c;
}

/** CSS color matching tempColor, for the SVG fallback. */
function tempCss(T: number): string {
  const c = tempColor(T);
  const hex = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 255).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

function geomOf(p: MillerParams & { a: number }): MillerParams {
  return { R0: p.R0, a: p.a, kappa: p.kappa, delta: p.delta };
}

function PlasmaTorus() {
  const params = useSim((s) => s.params);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowRef = useRef<THREE.MeshBasicMaterial>(null);
  const flashRef = useRef(0);
  const prevQRef = useRef(0);

  const geom = geomOf(params);

  const { tube, glowTube } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const th = (2 * Math.PI * i) / N;
      const [x, y, z] = millerSurfacePoint(geom, 1, th, 0);
      pts.push(new THREE.Vector3(x * SCALE, z * SCALE, y * SCALE));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    // tube radius shrinks slightly with size so big machines don't look bloated
    const tubeR = params.a * SCALE * 0.55;
    return {
      tube: new THREE.TubeGeometry(curve, 200, tubeR, 24, true),
      glowTube: new THREE.TubeGeometry(curve, 200, tubeR * 2.1, 24, true),
    };
  }, [params.R0, params.a, params.kappa, params.delta]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const { lastFrame } = useSim.getState();
    const mat = matRef.current;
    if (!mat) return;
    const T = lastFrame?.state.TkeV ?? 0.5;
    const running = useSim.getState().running;
    const target = running ? tempColor(T) : tempColor(0.8);
    mat.emissive.lerp(target, Math.min(dt * 3, 1));
    // ignition flash: Q crossing 5
    const Q = lastFrame?.Q ?? 0;
    if (Q > 5 && prevQRef.current <= 5) flashRef.current = 1;
    prevQRef.current = Q;
    flashRef.current = Math.max(flashRef.current - dt * 0.5, 0);
    // capped: keeps the ring legible instead of blowing out to flat white
    mat.emissiveIntensity = 0.55 + Math.min(T / 18, 0.85) + flashRef.current * 0.6;
    if (glowRef.current) {
      glowRef.current.color.copy(target);
      glowRef.current.opacity =
        0.10 + Math.min(T / 22, 0.55) + flashRef.current * 0.22;
    }
  });

  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial
          ref={matRef}
          color="#0b0510"
          emissive="#220a04"
          emissiveIntensity={0.55}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {/* additive halo: bloom-like glow without postprocessing */}
      <mesh geometry={glowTube} renderOrder={2}>
        <meshBasicMaterial
          ref={glowRef}
          color="#22d3ee"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function FieldLines() {
  const params = useSim((s) => s.params);
  const q = q95(
    { R0: params.R0, a: params.a, kappa: params.kappa, delta: params.delta },
    params.Bt,
    params.Ip
  );

  const lines = useMemo(() => {
    const out: THREE.BufferGeometry[] = [];
    const nLines = 6;
    const qClamp = Math.min(Math.max(q, 1.2), 8);
    for (let L = 0; L < nLines; L++) {
      const rho = 0.55 + 0.45 * (L / (nLines - 1));
      const th0 = (2 * Math.PI * L) / nLines;
      const pts: THREE.Vector3[] = [];
      const N = 720;
      const thTotal = 2 * Math.PI * qClamp; // one toroidal turn worth of poloidal winding
      for (let i = 0; i <= N; i++) {
        const th = th0 + (thTotal * i) / N;
        const phi = th / qClamp;
        const [x, y, z] = millerSurfacePoint(
          { R0: params.R0, a: params.a, kappa: params.kappa, delta: params.delta },
          rho,
          th,
          phi
        );
        pts.push(new THREE.Vector3(x * SCALE, z * SCALE, y * SCALE));
      }
      out.push(new THREE.BufferGeometry().setFromPoints(pts));
    }
    return out;
  }, [params.R0, params.a, params.kappa, params.delta, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group>
      {lines.map((g, i) => (
        <line key={i}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.28} />
        </line>
      ))}
    </group>
  );
}

const N_PARTICLES = 320;

function Particles() {
  const params = useSim((s) => s.params);
  const q = q95(
    { R0: params.R0, a: params.a, kappa: params.kappa, delta: params.delta },
    params.Bt,
    params.Ip
  );
  const state = useRef(
    Array.from({ length: N_PARTICLES }, () => ({
      rho: 0.3 + Math.random() * 0.68,
      th: Math.random() * 2 * Math.PI,
      phi: Math.random() * 2 * Math.PI,
      w: 0.6 + Math.random() * 0.8, // speed factor
      wob: Math.random() * Math.PI * 2,
    }))
  );
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_PARTICLES * 3), 3));
    return g;
  }, []);

  useFrame((_, dt) => {
    const arr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const qC = Math.min(Math.max(q, 1.2), 8);
    const s = useSim.getState();
    const speed = s.running ? 1 : 0.15;
    for (let i = 0; i < N_PARTICLES; i++) {
      const p = state.current[i];
      p.th += dt * 1.6 * p.w * speed;
      p.phi += (dt * 1.6 * p.w * speed) / qC;
      p.wob += dt * 0.7 * speed;
      const rho = p.rho + 0.04 * Math.sin(p.wob);
      const [x, y, z] = millerSurfacePoint(
        { R0: params.R0, a: params.a, kappa: params.kappa, delta: params.delta },
        Math.max(rho, 0.05),
        p.th,
        p.phi
      );
      arr.setXYZ(i, x * SCALE, z * SCALE, y * SCALE);
    }
    arr.needsUpdate = true;
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      mat.opacity = s.running ? 0.85 : 0.3;
    }
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial color="#a5f3fc" size={0.07} transparent opacity={0.85} sizeAttenuation />
    </points>
  );
}

function Vessel() {
  const params = useSim((s) => s.params);
  const R = (params.R0 + params.a * 0.4) * SCALE;
  const tube = (params.a * 0.62 + 0.3) * SCALE;
  const coils = useMemo(() => Array.from({ length: 10 }, (_, i) => (i * Math.PI) / 5), []);
  const coilR = (params.a * 0.62 + 0.52) * SCALE;

  return (
    <group>
      {/* vacuum vessel: semi-transparent so the plasma ring reads through */}
      <mesh renderOrder={1}>
        <torusGeometry args={[R, tube, 20, 100]} />
        <meshStandardMaterial
          color="#1a2436"
          metalness={0.85}
          roughness={0.35}
          transparent
          opacity={0.42}
          depthWrite={false}
        />
      </mesh>
      {/* TF coils as vertical rings */}
      {coils.map((ry, i) => (
        <mesh key={i} rotation={[0, ry, 0]} position={[params.R0 * SCALE * 0.0, 0, 0]}>
          <torusGeometry args={[coilR, 0.045, 8, 40]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* WebGL detection + GPU badge                                         */
/* ------------------------------------------------------------------ */

function detectWebGL(): { ok: boolean; renderer: string; reason: string } {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ||
      c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return { ok: false, renderer: "none", reason: "WebGL unavailable" };
    let renderer = "unknown GPU";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "unknown GPU");
    }
    // SwiftShader / software fallback is a strong signal GPU accel is off
    const swift = /swiftshader|software|llvmpipe/i.test(renderer);
    return { ok: true, renderer, reason: swift ? "software rendering" : "" };
  } catch (e) {
    return { ok: false, renderer: "none", reason: e instanceof Error ? e.message : "error" };
  }
}

function GpuBadge({ text, warn }: { text: string; warn: boolean }) {
  if (!text) return null;
  return (
    <div
      className={`pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-2 py-0.5 font-mono text-[9px] ${
        warn ? "text-amber-400" : "text-slate-500"
      }`}
    >
      {warn ? "⚠ " : ""}
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SVG fallback: animated 2-D projection of the same geometry          */
/* ------------------------------------------------------------------ */

const VP_W = 860;
const VP_H = 440;
const PX = 40; // pixels per scene unit
const CX = VP_W / 2;
const CY = VP_H / 2 + 8;
const COS_T = 0.86;
const SIN_T = 0.5;

function project(x: number, y: number, z: number): [number, number] {
  return [CX + (x * COS_T - y * SIN_T) * PX, CY - z * PX];
}

function SvgTorus() {
  const params = useSim((s) => s.params);
  const geom = geomOf(params);
  const q = q95(
    { R0: params.R0, a: params.a, kappa: params.kappa, delta: params.delta },
    params.Bt,
    params.Ip
  );
  const ringRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const dotsRef = useRef<Array<SVGCircleElement | null>>([]);

  // static paths: ring centerline + helical field lines
  const { ringPath, helixPaths, particles } = useMemo(() => {
    const ringPts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const th = (2 * Math.PI * i) / 120;
      const [x, y, z] = millerSurfacePoint(geom, 1, th, 0);
      const [sx, sy] = project(x * SCALE, y * SCALE, z * SCALE);
      ringPts.push(`${i ? "L" : "M"}${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    const qClamp = Math.min(Math.max(q, 1.2), 8);
    const helices: string[] = [];
    for (let L = 0; L < 3; L++) {
      const rho = 0.65 + 0.3 * L;
      const th0 = (2 * Math.PI * L) / 3;
      const pts: string[] = [];
      const N = 500;
      const thTotal = 2 * Math.PI * qClamp;
      for (let i = 0; i <= N; i++) {
        const th = th0 + (thTotal * i) / N;
        const phi = th / qClamp;
        const [x, y, z] = millerSurfacePoint(geom, rho, th, phi);
        const [sx, sy] = project(x * SCALE, y * SCALE, z * SCALE);
        pts.push(`${i ? "L" : "M"}${sx.toFixed(1)},${sy.toFixed(1)}`);
      }
      helices.push(pts.join(""));
    }
    const parts = Array.from({ length: 60 }, () => ({
      rho: 0.35 + Math.random() * 0.6,
      th: Math.random() * 2 * Math.PI,
      w: 0.6 + Math.random() * 0.9,
    }));
    return { ringPath: ringPts.join("") + " Z", helixPaths: helices, particles: parts };
  }, [params.R0, params.a, params.kappa, params.delta, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const tubeW = params.a * SCALE * 1.05 * PX;

  // animation loop: particle motion + temperature color
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let phase = 0;
    const tick = (now: number) => {
      const dt = last === null ? 0.016 : Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = useSim.getState();
      const speed = s.running ? 1 : 0.12;
      phase += dt * 1.6 * speed;
      const qC = Math.min(Math.max(q, 1.2), 8);
      const T = s.lastFrame?.state.TkeV ?? 0.5;
      const css = tempCss(s.running ? T : 0.8);
      const glowOp = String(0.18 + Math.min(T / 22, 0.5));
      if (ringRef.current) ringRef.current.setAttribute("stroke", css);
      if (glowRef.current) {
        glowRef.current.setAttribute("stroke", css);
        glowRef.current.setAttribute("stroke-opacity", glowOp);
      }
      particles.forEach((p, i) => {
        const el = dotsRef.current[i];
        if (!el) return;
        const th = p.th + phase * p.w;
        const phi = th / qC;
        const [x, y, z] = millerSurfacePoint(geom, p.rho, th, phi);
        const [sx, sy] = project(x * SCALE, y * SCALE, z * SCALE);
        el.setAttribute("cx", sx.toFixed(1));
        el.setAttribute("cy", sy.toFixed(1));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [particles, geom, q]);

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VP_W} ${VP_H}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="plasma-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        {/* vacuum vessel */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={((params.R0 + params.a * 0.4) * SCALE) * PX}
          ry={((params.R0 + params.a * 0.4) * SCALE) * PX * 0.62}
          fill="none"
          stroke="#1a2436"
          strokeWidth={(params.a * 0.62 + 0.3) * SCALE * PX * 0.8}
          opacity={0.5}
        />
        {/* glow halo */}
        <path
          ref={glowRef}
          d={ringPath}
          fill="none"
          stroke="#ff7722"
          strokeWidth={tubeW * 2.4}
          strokeOpacity={0.2}
          strokeLinecap="round"
          filter="url(#plasma-glow)"
        />
        {/* plasma ring */}
        <path
          ref={ringRef}
          d={ringPath}
          fill="none"
          stroke="#ff7722"
          strokeWidth={tubeW}
          strokeOpacity={0.9}
          strokeLinecap="round"
        />
        {/* field lines */}
        {helixPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#22d3ee" strokeWidth={1} strokeOpacity={0.3} />
        ))}
        {/* particles */}
        {particles.map((_, i) => (
          <circle
            key={i}
            ref={(el) => {
              dotsRef.current[i] = el;
            }}
            r={2.1}
            fill="#a5f3fc"
            opacity={0.85}
          />
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root: pick 3-D or fallback, report GPU                              */
/* ------------------------------------------------------------------ */

type Mode = "checking" | "webgl" | "fallback";

function Scene3D({ onContextLost, onRenderer }: { onContextLost: () => void; onRenderer: (r: string, warn: boolean) => void }) {
  return (
    <Canvas
      camera={{ position: [0, 9.5, 19], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        const el = gl.domElement;
        el.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost();
        });
        const raw = gl.getContext() as WebGLRenderingContext | null;
        const dbg = raw ? raw.getExtension("WEBGL_debug_renderer_info") : null;
        const r =
          raw && dbg
            ? String(raw.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "")
            : "";
        onRenderer(r, /swiftshader|software|llvmpipe/i.test(r));
      }}
    >
      <color attach="background" args={["#04060d"]} />
      <fog attach="fog" args={["#04060d", 28, 64]} />
      <ambientLight intensity={0.25} />
      <pointLight position={[10, 12, 8]} intensity={60} color="#8899cc" />
      <pointLight position={[-12, -6, -8]} intensity={25} color="#445577" />
      <Stars radius={60} depth={30} count={1800} factor={3} fade />
      <PlasmaTorus />
      <FieldLines />
      <Particles />
      <Vessel />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.5}
        minDistance={5}
        maxDistance={34}
      />
    </Canvas>
  );
}

export default function TorusScene() {
  const [mode, setMode] = useState<Mode>("checking");
  const [gpu, setGpu] = useState<{ text: string; warn: boolean }>({ text: "", warn: false });

  useEffect(() => {
    const d = detectWebGL();
    if (d.ok) {
      setMode("webgl");
      setGpu({ text: d.reason ? `${d.renderer} · ${d.reason}` : d.renderer, warn: !!d.reason });
    } else {
      setMode("fallback");
      setGpu({ text: `${d.reason} · showing 2-D fallback`, warn: true });
    }
  }, []);

  if (mode === "checking") {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
        checking WebGL…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {mode === "webgl" ? (
        <Scene3D
          onContextLost={() => setMode("fallback")}
          onRenderer={(r, warn) => setGpu({ text: r, warn })}
        />
      ) : (
        <SvgTorus />
      )}
      <GpuBadge
        text={
          mode === "webgl"
            ? gpu.text
            : `2-D fallback · ${gpu.text || "WebGL unavailable"}`
        }
        warn={mode !== "webgl" || gpu.warn}
      />
    </div>
  );
}
