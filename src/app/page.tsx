"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSim, createSimLoop } from "@/lib/sim/store";
import Sliders from "@/components/controls/Sliders";
import RunControls from "@/components/controls/RunControls";
import Readouts from "@/components/charts/Readouts";
import HistoryChart from "@/components/charts/HistoryChart";
import CrossSection from "@/components/torus/CrossSection";
import SceneErrorBoundary from "@/components/torus/SceneErrorBoundary";

const TorusScene = dynamic(() => import("@/components/torus/TorusScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">
      igniting 3D scene…
    </div>
  ),
});

export default function Home() {
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      createSimLoop();
      started.current = true;
    }
  }, []);

  return (
    <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[320px_1fr_340px]">
      {/* left: controls */}
      <section className="order-2 lg:order-1">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <Sliders />
        </div>
      </section>

      {/* center: 3D view + charts */}
      <section className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="h-[440px] overflow-hidden rounded-xl border border-slate-800 bg-black/60">
          <SceneErrorBoundary>
            <TorusScene />
          </SceneErrorBoundary>
        </div>
        <RunControls />
        <HistoryChart />
      </section>

      {/* right: readouts + cross-section */}
      <section className="order-3 flex flex-col gap-4">
        <Readouts />
        <CrossSection />
      </section>
    </main>
  );
}
