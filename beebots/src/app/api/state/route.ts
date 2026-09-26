/** GET /api/state — public, read-only dashboard payload. No secrets. */

import { NextResponse } from "next/server";
import { buildState } from "@/lib/prod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await buildState();
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "state unavailable" },
      { status: 503 },
    );
  }
}
