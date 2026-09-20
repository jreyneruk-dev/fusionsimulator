"use client";

/**
 * Error boundary around the 3-D canvas. Catches WebGL-creation failures
 * and lazy-chunk load failures (e.g. a browser tab that outlived a
 * redeploy) and shows a recoverable panel instead of a silent black box.
 */
import React from "react";

interface State {
  error: Error | null;
  retryKey: number;
}

export default class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Surface the real reason in the console for diagnosis
    console.error("[TorusScene] 3-D scene failed:", error);
  }

  retry = () => {
    this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      const likelyGpu =
        /webgl|context|gpu/i.test(msg) ||
        (typeof document !== "undefined" && !(() => {
          try {
            const c = document.createElement("canvas");
            return !!(c.getContext("webgl2") || c.getContext("webgl"));
          } catch {
            return false;
          }
        })());
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-3xl">🛰️</div>
          <div className="text-sm font-semibold text-slate-300">
            3-D view unavailable
          </div>
          <div className="max-w-md text-xs leading-relaxed text-slate-500">
            {likelyGpu
              ? "WebGL could not start in this tab. Hardware acceleration may be disabled, or the GPU context was lost (common after the page has been open across a rebuild)."
              : "The 3-D scene failed to load. If this tab was open during a redeploy, its cached chunks are stale."}
            <span className="mt-1 block font-mono text-[10px] text-slate-600">
              {msg.slice(0, 160)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={this.retry}
              className="rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-cyan-50 transition-colors hover:bg-cyan-600"
            >
              ↻ Retry 3-D scene
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700"
            >
              Reload page
            </button>
          </div>
          <div className="text-[10px] text-slate-600">
            The physics simulation keeps running — readouts, chart, and
            cross-section below are unaffected.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
