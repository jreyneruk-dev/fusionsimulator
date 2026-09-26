/**
 * GET /api/watchdog — Vercel Cron (once daily). If the external scheduler has
 * been silent for over 10 minutes, run one catch-up tick. Vercel sends the
 * CRON_SECRET as a Bearer token automatically.
 */

import { NextResponse } from "next/server";
import { productionTick } from "@/lib/prod/tick";
import { lastDecisionTs } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_MS = 10 * 60_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let last: number | null;
  try {
    last = await lastDecisionTs();
  } catch (err) {
    // Misconfiguration (e.g. no DATABASE_URL) must reach the scheduler as JSON,
    // not as an opaque HTML error page.
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "watchdog unavailable" },
      { status: 503 },
    );
  }
  const staleForMs = last === null ? null : Date.now() - last;
  if (staleForMs !== null && staleForMs < STALE_MS) {
    return NextResponse.json({ ok: true, skipped: true, lastTickAgeMs: staleForMs });
  }
  const summary = await productionTick();
  return NextResponse.json({ ...summary, lastTickAgeMs: staleForMs, catchUp: true }, { status: summary.ok ? 200 : 500 });
}
