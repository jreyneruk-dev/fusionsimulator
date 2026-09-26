/**
 * Local end-to-end proof of the DB-backed loop, no Docker and no external
 * credentials: an embedded Postgres (zonky binaries) + the served production
 * build. Drives the real HTTP surface exactly as the scheduler and dashboard
 * would and prints a transcript. Exits non-zero on the first failed step.
 *
 *   npx tsx scripts/e2e-local.ts
 */
import "./lib-env.ts";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const PG_PORT = 5499;
const APP_PORT = 3215;
const APP = `http://localhost:${APP_PORT}`;
const PASSWORD = "hive-proof";

let step = 0;
const log = (line = "") => console.log(line);
function fail(msg: string): never {
  throw new Error(`step ${step}: ${msg}`);
}
function ok(cond: unknown, msg: string): void {
  if (!cond) fail(msg);
}

const dataDir = mkdtempSync(join(tmpdir(), "beebots-pg-"));
let app: ChildProcess | null = null;
let sql: postgres.Sql | null = null;
let pg: InstanceType<typeof EmbeddedPostgres> | null = null;

async function main() {
  // 1. Embedded Postgres (no Docker, no credentials).
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "password",
    port: PG_PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("beebots");
  const url = `postgres://postgres:password@localhost:${PG_PORT}/beebots`;
  process.env.DATABASE_URL = url;
  process.env.OWNER_PASSWORD_HASH = createHash("sha256").update(PASSWORD).digest("hex");
  // CRON_SECRET stays unset: local dev mode, /api/tick accepts unauthenticated POSTs.
  log(`[${++step}] embedded Postgres up on :${PG_PORT} (${dataDir})`);

  // 2. Apply the real schema via the real script.
  const schema = spawnSyncNpx(["tsx", "scripts/apply-schema.ts"]);
  ok(schema.includes("Applied"), `schema apply output was: ${schema}`);
  log(`[${++step}] schema applied: ${schema.trim().split("\n").pop()}`);

  // 3. Serve the production build. Free the port first: a previous run's
  // next-server can outlive its npx wrapper and hold the port (EADDRINUSE).
  try {
    execSync(`lsof -ti tcp:${APP_PORT} | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // port already free
  }
  app = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
    env: { ...process.env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  const appErr: string[] = [];
  app.stderr?.on("data", (d) => appErr.push(String(d)));
  let up = false;
  for (let i = 0; i < 30 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    up = await fetch(`${APP}/`)
      .then((r) => r.ok)
      .catch(() => false);
  }
  ok(up, `production server never became ready. stderr:\n${appErr.slice(-10).join("")}`);
  log(`[${++step}] production build serving on :${APP_PORT}`);

  sql = postgres(url, { prepare: false });

  // 4. First tick: keyless Jev by design; self-seed + first decisions/fills/equity.
  const tick1 = (await post("/api/tick")) as TickSummary;
  ok(tick1.ok === true, `first tick failed: ${JSON.stringify(tick1)}`);
  log(`[${++step}] tick #1 ok: provider=${tick1.provider} decisions=${tick1.decisions} fills=${tick1.fills} notes=${JSON.stringify(tick1.notes)}`);

  // 5. DB state behind it: three seeded bees, decisions with cost_usd, fills, equity.
  const bees = await sql`SELECT bee_id, name, style, start_equity_usd, fees_paid FROM bees ORDER BY bee_id`;
  ok(bees.length === 3, `expected 3 seeded bees, got ${bees.length}`);
  const dec1 = await sql`SELECT count(*)::int AS n, count(cost_usd)::int AS with_cost FROM decisions`;
  const fills1 = await sql`SELECT count(*)::int AS n FROM fills`;
  const eq1 = await sql`SELECT count(*)::int AS n FROM equity_history`;
  ok(Number(dec1[0].n) >= 1 && Number(fills1[0].n) >= 2 && Number(eq1[0].n) === 3, `expected decisions>=1, fills>=2, equity=3; got ${JSON.stringify({ dec1, fills1, eq1 })}`);
  ok(Number(dec1[0].with_cost) === Number(dec1[0].n), "cost_usd column missing for some decision rows");
  const feesPaidBefore = Number((await sql`SELECT COALESCE(SUM(fees_paid),0) AS s FROM bees`)[0].s);
  log(`[${++step}] DB after tick #1: bees=${bees.length} decisions=${dec1[0].n} fills=${fills1[0].n} equityRows=${eq1[0].n} beesFeesPaid=${feesPaidBefore.toFixed(4)}`);

  // 6. GET /api/state reflects the persisted bees.
  const state = (await get("/api/state")) as { mode: string; bees: { beeId: string; equity: number; position: unknown }[]; costs: { fees: number } };
  ok(state.mode === "paper" && state.bees.length === 3, `state wrong: ${JSON.stringify(state).slice(0, 200)}`);
  const positioned = state.bees.filter((b) => b.position).length;
  log(`[${++step}] /api/state: mode=${state.mode} bees=[${state.bees.map((b) => `${b.beeId}:eq=${typeof b.equity === "number" ? b.equity.toFixed(2) : JSON.stringify(b)}`).join(", ")}] (${positioned} positioned)`);

  // 7. Watchdog stale-check reads MAX(ts) from decisions.
  const wd = (await get("/api/watchdog")) as { skipped?: boolean; lastTickAgeMs?: number };
  ok(wd.skipped === true && typeof wd.lastTickAgeMs === "number", `watchdog should skip on a fresh decision ts: ${JSON.stringify(wd)}`);
  log(`[${++step}] /api/watchdog: skipped=${wd.skipped} lastTickAgeMs=${wd.lastTickAgeMs}`);

  // 8. Admin pause takes effect in the loop.
  const adm = (await post("/api/admin", { action: "pause", beeId: "sting", password: PASSWORD })) as { ok?: boolean };
  ok(adm.ok === true, `admin pause failed: ${JSON.stringify(adm)}`);
  const wrongPw = await fetch(`${APP}/api/admin`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pause", beeId: "sting", password: "nope" }) });
  ok(wrongPw.status === 401, `wrong password should 401, got ${wrongPw.status}`);
  log(`[${++step}] /api/admin: sting paused (wrong password correctly 401)`);

  // 9. Second tick is incremental: no re-seed, paused bee silent, counters grow.
  const maxTsBefore = Number((await sql`SELECT COALESCE(MAX(ts),0) AS t FROM decisions`)[0].t);
  const tick2 = (await post("/api/tick")) as TickSummary;
  ok(tick2.ok === true, `second tick failed: ${JSON.stringify(tick2)}`);
  const beesAfter2 = await sql`SELECT count(*)::int AS n FROM bees`;
  ok(Number(beesAfter2[0].n) === 3, "bee count changed — a re-seed happened");
  const feesPaidAfter2 = Number((await sql`SELECT COALESCE(SUM(fees_paid),0) AS s FROM bees`)[0].s);
  ok(feesPaidAfter2 >= feesPaidBefore, `fees_paid shrank (${feesPaidBefore} -> ${feesPaidAfter2}) — state was reset`);
  const stingRows = await sql`SELECT count(*)::int AS n FROM decisions WHERE ts > ${maxTsBefore} AND bee_id = 'sting'`;
  ok(Number(stingRows[0].n) === 0, "paused sting produced a decision — pause not enforced");
  const hoverRows = await sql`SELECT count(*)::int AS n FROM decisions WHERE ts > ${maxTsBefore} AND bee_id = 'hover'`;
  ok(Number(hoverRows[0].n) >= 1, "active hover produced no decision on tick #2");
  log(`[${++step}] tick #2 incremental: bees=3 (no re-seed), fees_paid ${feesPaidBefore.toFixed(4)} -> ${feesPaidAfter2.toFixed(4)}, paused sting silent, hover decided`);

  // 10. Concurrency: five overlapping ticks — exactly one runs, none double-fill.
  const fillsBeforeBurst = Number((await sql`SELECT count(*)::int AS n FROM fills`)[0].n);
  const burst = await Promise.all(Array.from({ length: 5 }, () => post("/api/tick")));
  const summaries = burst as TickSummary[];
  const winners = summaries.filter((s) => s.ok === true && !s.skipped).length;
  const skipped = summaries.filter((s) => s.skipped === true).length;
  const fillsAfterBurst = Number((await sql`SELECT count(*)::int AS n FROM fills`)[0].n);
  log(`[${++step}] concurrent burst (5 ticks): winners=${winners} skipped=${skipped} fills ${fillsBeforeBurst} -> ${fillsAfterBurst} (+${fillsAfterBurst - fillsBeforeBurst})`);
  ok(winners === 1, `expected exactly 1 tick to win the lock, got ${winners}`);
  ok(skipped === 4, `expected 4 ticks to skip, got ${skipped}`);
  ok(fillsAfterBurst - fillsBeforeBurst <= 4, `fills grew by ${fillsAfterBurst - fillsBeforeBurst} — more than one tick's worth: double fill`);

  // 11. Data retention: pruneOldRows removes old rows, keeps recent ones.
  const recent = await sql`SELECT count(*)::int AS n FROM decisions`;
  const oldTs = Date.now() - 45 * 86_400_000;
  await sql`INSERT INTO decisions (ts, bee_id, style, final_action, size_usd, vetoed, provider) VALUES (${oldTs}, 'waggle', 'breakout', 'ANCIENT', 0, false, 'none')`;
  await sql`INSERT INTO fills (ts, bee_id, inst_id, side, kind, notional_usd, price, fee_usd, spread_cost_usd) VALUES (${oldTs}, 'waggle', 'BTC-USDT-SWAP', 'long', 'close', 1, 1, 0, 0)`;
  await sql`INSERT INTO equity_history (ts, bee_id, equity_usd, fees_paid, funding_paid, spread_paid) VALUES (${oldTs}, 'waggle', 1, 0, 0, 0)`;
  const { pruneOldRows } = await import("../src/lib/db.ts");
  await pruneOldRows(30);
  const afterPrune = await sql`SELECT count(*)::int AS n FROM decisions`;
  const ancientLeft = await sql`SELECT count(*)::int AS n FROM decisions WHERE final_action = 'ANCIENT'`;
  ok(Number(afterPrune[0].n) === Number(recent[0].n), `prune removed recent decisions (${recent[0].n} -> ${afterPrune[0].n})`);
  ok(Number(ancientLeft[0].n) === 0, "the ANCIENT decision survived pruning");
  const otherAncient = await sql`SELECT (SELECT count(*)::int FROM fills WHERE notional_usd = 1) AS f, (SELECT count(*)::int FROM equity_history WHERE equity_usd = 1) AS e`;
  ok(Number(otherAncient[0].f) === 0 && Number(otherAncient[0].e) === 0, "old fills/equity rows survived pruning");
  log(`[${++step}] pruneOldRows: old test rows gone from all three tables, recent rows kept`);

  log(`\nALL ${step} STEPS PASSED — the DB-backed loop is real.`);
}

interface TickSummary {
  ok: boolean;
  decisions: number;
  fills: number;
  provider: string;
  notes: string[];
  skipped?: boolean;
  error?: string;
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${APP}${path}`, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  ok(res.ok, `GET ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function post(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  ok(res.ok, `POST ${path} -> ${res.status}: ${JSON.stringify(parsed)}`);
  return parsed;
}

function spawnSyncNpx(args: string[]): string {
  try {
    return execSync(`npx ${args.join(" ")}`, { env: { ...process.env }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  } catch (err) {
    return String((err as { stdout?: string }).stdout ?? err);
  }
}

try {
  await main();
} catch (err) {
  console.error(`\nPROOF FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  // Cast through the declared types: TS cannot see the assignments inside
  // main() and narrows these to null at the top-level finally.
  (app as ChildProcess | null)?.kill();
  await (sql as postgres.Sql | null)?.end().catch(() => {});
  await (pg as InstanceType<typeof EmbeddedPostgres> | null)?.stop().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
  log(`teardown: app stopped, postgres stopped, ${dataDir} removed`);
}
