-- beebots on Vercel — Postgres schema (Supabase free tier friendly).
-- Apply with: npm run schema  (scripts/apply-schema.ts)

CREATE TABLE IF NOT EXISTS bees (
  bee_id              TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  style               TEXT NOT NULL CHECK (style IN ('breakout', 'trend', 'momentum')),
  tagline             TEXT NOT NULL DEFAULT '',
  start_equity_usd    DOUBLE PRECISION NOT NULL,
  realized_pnl        DOUBLE PRECISION NOT NULL DEFAULT 0,
  fees_paid           DOUBLE PRECISION NOT NULL DEFAULT 0,
  funding_paid        DOUBLE PRECISION NOT NULL DEFAULT 0,
  spread_paid         DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_json       TEXT,
  retired             BOOLEAN NOT NULL DEFAULT FALSE,
  paused              BOOLEAN NOT NULL DEFAULT FALSE,
  day_key             TEXT NOT NULL,
  day_start_equity_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  trades_today        INTEGER NOT NULL DEFAULT 0,
  fees_today          DOUBLE PRECISION NOT NULL DEFAULT 0,
  flat_since_ts       BIGINT,
  last_close_ts       BIGINT,
  last_funding_ts     BIGINT
);

CREATE TABLE IF NOT EXISTS decisions (
  ts            BIGINT NOT NULL,
  bee_id        TEXT NOT NULL,
  style         TEXT NOT NULL,
  chosen        TEXT,
  probabilities TEXT,
  conviction    TEXT,
  provider      TEXT NOT NULL DEFAULT 'none',
  final_action  TEXT NOT NULL,
  final_inst_id TEXT,
  final_side    TEXT,
  size_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
  vetoed        BOOLEAN NOT NULL DEFAULT FALSE,
  veto_reason   TEXT
);
CREATE INDEX IF NOT EXISTS decisions_ts_idx ON decisions (ts DESC);
CREATE INDEX IF NOT EXISTS decisions_bee_ts_idx ON decisions (bee_id, ts DESC);

CREATE TABLE IF NOT EXISTS fills (
  ts               BIGINT NOT NULL,
  bee_id           TEXT NOT NULL,
  inst_id          TEXT NOT NULL,
  side             TEXT NOT NULL,
  kind             TEXT NOT NULL,
  notional_usd     DOUBLE PRECISION NOT NULL,
  price            DOUBLE PRECISION NOT NULL,
  fee_usd          DOUBLE PRECISION NOT NULL,
  spread_cost_usd  DOUBLE PRECISION NOT NULL,
  realized_pnl_usd DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS fills_ts_idx ON fills (ts DESC);

CREATE TABLE IF NOT EXISTS equity_history (
  ts           BIGINT NOT NULL,
  bee_id       TEXT NOT NULL,
  equity_usd   DOUBLE PRECISION NOT NULL,
  fees_paid    DOUBLE PRECISION NOT NULL,
  funding_paid DOUBLE PRECISION NOT NULL,
  spread_paid  DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS equity_ts_idx ON equity_history (ts DESC);
