# beebots on Vercel 🐝

Three AI trading bees racing each other on real OKX prices with **paper money**.
A Vercel + Postgres port of [imikerussell/beebots](https://github.com/imikerussell/beebots) (MIT):
his strategies (Breakout / Trend / Momentum), his risk layer and his cost model —
rebuilt as serverless functions so the infra bill is $0.

> **Paper trading only.** No exchange account, no API keys with trade permission,
> nothing real moves. Not financial advice.

## What runs where

| Piece | Service | Cost |
|---|---|---|
| Dashboard + API | Vercel Hobby | $0 |
| Postgres ledger | Supabase free tier | $0 |
| 60-second scheduler | cron-job.org free tier | $0 |
| Decisions (Jev, batched, 1 call/min) | Vercel AI Gateway (`typesafe-ai/jev`) | ~$4–5/mo, hard-capped |

Per tick: refresh OKX public data (no keys needed) → build each bee's valid-move menu →
**one batched Jev call** for all three bees → the code risk layer vetoes/shrinks/forces →
paper fills at real prices with real taker fees, spread costs and funding → written to Postgres.

The three bees (our own names and art; strategies are his, MIT):

| Bee | Style | Rules |
|---|---|---|
| **Waggle** | Breakout | One volatility breakout a day: buy above today's UTC open + 0.5× yesterday's range on BTC/ETH/SOL/HYPE, ride to the close. Never forced in. 1 trade/day, $1 fee budget. |
| **Hover** | Trend | 9-slice Donchian ensemble on BTC/ETH, sized by |score|/9 under a vol cap, never flat (forced minimum ~$10), opens only at P ≥ 0.70 and "strong" conviction. |
| **Sting** | Momentum | Chases the strongest 7-day mover across the gated universe (≥$1M 24h volume, ≤15bp spread), stops at 3×ATR, 3 entries/day, $3 fee budget, never flat > 1 tick. |

Shared risk layer (all ported from his docs, enforced in code): max 2× leverage, $700 max
notional per bee, 8% daily loss stop, retirement at −60%, per-style spread gates,
trade caps, fee budgets, cooldowns, and a hard daily Jev spend cap.

## Structure (build with it, not against it)

Dependencies flow one way: `okx/` and `jev.ts` are adapters ← pure logic ← `prod/` wiring ← routes.

| Module | Owns |
|---|---|
| `src/lib/config.ts` | **The only env reader.** All policy: risk knobs, Jev provider resolution, crypto blocklist |
| `src/lib/indicators.ts` | Pure math on chronological series |
| `src/lib/okx/client.ts` | The single OKX-shape boundary (orientation, parsing, rate limits) |
| `src/lib/okx/aggregator.ts` | Per-coin snapshots from client data (no policy, no env) |
| `src/lib/strategies/` | Style menus, candidate ranking (pure) |
| `src/lib/stops.ts` | Per-style exit rules from the strategy docs (pure) |
| `src/lib/risk.ts` | Veto/shrink/force + Z2 funding veto (pure; imports ledger math) |
| `src/lib/ledger.ts` | **All money math**: fees, spread, funding, PnL, equity |
| `src/lib/jev.ts` | Jev client + prompt state; the real `EngineDeps.ask` adapter |
| `src/lib/engine.ts` | Pure tick; `deps.ask` is required — no hidden config path |
| `src/lib/db.ts` | Postgres I/O only (no content imports) |
| `src/lib/prod/market.ts` | Market cache ownership + TTL (one per process) |
| `src/lib/prod/host.ts` | Process singletons: shared market source + real deps |
| `src/lib/prod/tick.ts` | The write path: seeding, record-then-act, tick summary |
| `src/lib/prod/views.ts` | The read model: `StatePayload`, live re-marking |
| `src/content/bees.ts` | Bee roster + dashboard copy (imported by wiring/UI, never by db) |

State ownership: bee/account state lives in Postgres (one row per bee); the market
indicator cache lives in `prod/market.ts` (one per process, via `host.ts`); nothing else
holds mutable state. New rules go in `stops.ts`/`risk.ts`; new display data in `views.ts`.

## Deploy

1. **Supabase**: create a free project → copy the **pooled** connection string (port 6543).
2. **Vercel**: `npx vercel` from this folder (or push to GitHub and import). Region **fra1**
   (closest to OKX EEA). Environment variables:
   - `DATABASE_URL` — the Supabase pooled string
   - `CRON_SECRET` — `openssl rand -hex 24`
   - `OWNER_PASSWORD_HASH` — `echo -n "your password" | shasum -a 256` (optional; enables the admin API)
   - `TICK_SECONDS=60`, `JEV_DAILY_USD_CAP=0.20` (defaults are fine)
   - No Jev key needed on Vercel: the AI Gateway key is injected as `AI_GATEWAY_API_KEY`.
3. **Schema**: locally, `npm run schema` with `DATABASE_URL` set (or paste schema.sql into the Supabase SQL editor).
4. **cron-job.org**: free job, every 1 minute → `POST https://<app>.vercel.app/api/tick`,
   header `x-cron-secret: <CRON_SECRET>`. Vercel's own once-daily cron (`/api/watchdog`)
   is the catch-up if the pinger ever goes quiet for 10+ minutes.
5. Open the dashboard. The three bees self-seed on the first tick.

Jev providers (pick one): Vercel AI Gateway (default, `JEV_MODEL=typesafe-ai/jev`),
any OpenAI-compatible endpoint via `OPENAI_COMPAT_BASE_URL`/`_API_KEY`/`_MODEL`
(e.g. OpenRouter `typesafe/jev-1.13`), or none — with no provider the engine still runs
and holds every position (all loop machinery verifiable at zero cost).

## Develop

```sh
npm install
npm run dev          # dashboard on http://localhost:3200 (state API needs DATABASE_URL)
npm test             # vitest: risk gates, ledger math, indicators, menus, stops, fake-Jev e2e tick
npm run typecheck
npm run build
npm run tick:once    # one real engine tick against live OKX data (needs DATABASE_URL)
```

## Cost model (launch config)

Jev $0.042/1M input tokens, ~1.8–2.5k tokens per batched call, 43,200 calls/month →
**~$4–5/mo**, capped by `JEV_DAILY_USD_CAP` (bees hold when it trips). Trading fees on
paper mirror the real ones (taker 0.05%/leg + spread) so the cost counters on the
dashboard show what the same trading would cost live. Infra: $0.

## Not ported (on purpose)

His Setup wizard, OpenAI bee designer, Docker/Hostinger deploy, the public Hive
leaderboard, and his bees' names/portraits. Live and demo trading stay out of this
build entirely — `DRY_RUN=true` is a hard latch.

MIT. No warranty. Not financial advice.
