/**
 * POST /api/admin — owner-password-gated controls (pause/resume a bee).
 * The password is stored only as its SHA-256 hash in OWNER_PASSWORD_HASH;
 * the admin API is disabled entirely when that variable is empty.
 */

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { setBeePaused } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const hash = process.env.OWNER_PASSWORD_HASH;
  if (!hash) return NextResponse.json({ error: "admin api disabled" }, { status: 403 });
  let body: { action?: string; beeId?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const digest = createHash("sha256").update(body.password ?? "", "utf8").digest();
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== digest.length || !timingSafeEqual(digest, expected)) {
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  if (body.action === "pause" || body.action === "resume") {
    if (!body.beeId) return NextResponse.json({ error: "beeId required" }, { status: 400 });
    await setBeePaused(body.beeId, body.action === "pause");
    return NextResponse.json({ ok: true, beeId: body.beeId, paused: body.action === "pause" });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
