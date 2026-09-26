/**
 * POST /api/tick — the loop body. Called every TICK_SECONDS by the external
 * scheduler (cron-job.org free tier) with the x-cron-secret header.
 */

import { NextResponse } from "next/server";
import { productionTick } from "@/lib/prod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (local dev)
  const header = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await productionTick();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
