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
npm test             # 58 vitest tests: risk gates, ledger math, indicators, menus, fake-Jev e2e tick
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
