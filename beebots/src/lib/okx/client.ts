/**
 * OKX public market data client (EEA site, no API keys).
 * Mirrors what imikerussell/beebots pulls through OKX's open-source Agent Trade
 * Kit public REST client (MIT): instruments, tickers, candles, funding, OI.
 * Endpoints are unauthenticated public market data.
 *
 * ORIENTATION CONTRACT: OKX returns candles and funding history NEWEST FIRST.
 * Every series this module returns is CHRONOLOGICAL (oldest first) — the
 * reversal happens here, once, so no consumer can receive the wrong order.
 */

const BASE = process.env.OKX_API_BASE || "https://eea.okx.com";

async function get(path: string, params: Record<string, string | number | undefined>, attempt = 0): Promise<unknown[]> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  // Observed 429 bursts on history-candles during playtest bursts; one
  // backoff-and-retry recovers the page (a lost history page caps the 4h
  // series below the 361 bars the trend ensemble needs).
  if (res.status === 429 && attempt < 1) {
    await new Promise((r) => setTimeout(r, 600));
    return get(path, params, attempt + 1);
  }
  if (!res.ok) throw new Error(`OKX ${path} HTTP ${res.status}`);
  const body = (await res.json()) as { code: string; data: unknown[] };
  if (body.code !== "0") throw new Error(`OKX ${path} code ${body.code}`);
  return body.data ?? [];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface OkxInstrument {
  instId: string;
  instType: string;
  uly?: string;
  ctVal?: string;
  settleCcy?: string;
}

/** Crypto X-Perps (linear USDT perpetuals). SWAP covers crypto; stock tokens share the type but are filtered by universe. */
export async function fetchInstruments(): Promise<OkxInstrument[]> {
  const rows = (await get("/api/v5/public/instruments", { instType: "SWAP" })) as OkxInstrument[];
  return rows.filter((r) => r.instId?.endsWith("-USDT-SWAP"));
}

export interface OkxTicker {
  instId: string;
  last: string;
  askPx: string;
  bidPx: string;
  /** 24h volume in BASE currency units (e.g. BTC) on USDT swaps */
  volCcy24h: string;
  /** 24h volume in QUOTE currency (USDT) — the dollar-ish figure */
  volCcyQuote24h?: string;
  open24h?: string;
  sodUtc0?: string;
  sodUtc8?: string;
}

/** 24h volume in USD terms: quote volume when present, else base volume x price. */
export function tickerVolumeUsd(t: OkxTicker): number {
  const quote = Number(t.volCcyQuote24h ?? "");
  if (Number.isFinite(quote) && quote > 0) return quote;
  const base = Number(t.volCcy24h);
  const last = Number(t.last);
  return Number.isFinite(base) && Number.isFinite(last) ? base * last : 0;
}

export async function fetchTickers(): Promise<OkxTicker[]> {
  return (await get("/api/v5/market/tickers", { instType: "SWAP" })) as OkxTicker[];
}

/**
 * Candles: paged automatically (market/candles up to 300, then history-candles
 * for the remainder), parsed and returned CHRONOLOGICAL (oldest first). A
 * history-page failure is logged and degraded deliberately (fresher bars only),
 * never silent. This is the single OKX-shape boundary: consumers never see
 * string rows or reversal logic.
 */
export interface CandleBar {
  ts: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function parseCandleRows(rows: string[][]): CandleBar[] {
  return rows
    .map((r) => ({ ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }))
    .filter((b) => Number.isFinite(b.ts) && Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l) && Number.isFinite(b.c) && Number.isFinite(b.v));
}

export async function fetchCandleSeries(instId: string, bar: string, limit: number): Promise<CandleBar[]> {
  const first = (await get("/api/v5/market/candles", { instId, bar, limit: Math.min(limit, 300) })) as string[][];
  let rows = first;
  if (first.length >= 300 && limit > 300) {
    // OKX sends newest first, so the oldest row we hold is the last one;
    // history-candles returns rows earlier than that timestamp.
    const after = Number(first[first.length - 1][0]);
    try {
      const older = (await get("/api/v5/market/history-candles", { instId, bar, after, limit: Math.min(limit - 300, 100) })) as string[][];
      // Both pages are newest-first; newest-block then older-block reverses to chronological.
      rows = first.concat(older);
    } catch (err) {
      console.warn(`[okx] ${instId} ${bar}: older candles unavailable (${message(err)}) — continuing with ${rows.length} freshest bars`);
    }
  }
  return parseCandleRows(rows.slice().reverse()); // newest first -> chronological bars
}

export async function fetchFundingRate(instId: string): Promise<{ fundingRate: string; fundingTime: string } | null> {
  const rows = (await get("/api/v5/public/funding-rate", { instId })) as { fundingRate: string; fundingTime: string }[];
  return rows[0] ?? null;
}

export interface FundingRow {
  fundingRate: number;
  fundingTime: number;
}

/**
 * Parse funding-rate-history rows (OKX shape: objects, NEWEST first) into
 * numeric rows in CHRONOLOGICAL order. Exported for the orientation regression
 * test; fetchFundingHistory is its networked wrapper. Non-parsable rows are
 * dropped; callers decide whether an empty result is a failure.
 */
export function parseFundingHistoryRows(rows: { fundingRate?: string; fundingTime?: string }[]): FundingRow[] {
  const parsed = rows
    .map((r) => ({ rate: r.fundingRate?.trim(), time: r.fundingTime?.trim() }))
    .filter((r): r is { rate: string; time: string } => Boolean(r.rate) && Boolean(r.time))
    .map((r) => ({ fundingRate: Number(r.rate), fundingTime: Number(r.time) }))
    .filter((r) => Number.isFinite(r.fundingRate) && Number.isFinite(r.fundingTime) && r.fundingTime > 0);
  return parsed.reverse();
}

/**
 * Funding-rate history, CHRONOLOGICAL (oldest first), numeric. Throws on any
 * API or parsing failure — callers degrade deliberately (warn and withhold
 * fundingZ), never silently.
 */
export async function fetchFundingHistory(instId: string, limit = 90): Promise<FundingRow[]> {
  const rows = (await get("/api/v5/public/funding-rate-history", { instId, limit })) as {
    fundingRate?: string;
    fundingTime?: string;
  }[];
  const parsed = parseFundingHistoryRows(rows ?? []);
  if (parsed.length === 0) throw new Error("funding-rate-history returned no parsable rows");
  return parsed;
}

export async function fetchOpenInterest(instId: string): Promise<{ oi: string; oiCcy?: string } | null> {
  const rows = (await get("/api/v5/public/open-interest", { instType: "SWAP", instId })) as { oi: string; oiCcy?: string }[];
  return rows[0] ?? null;
}
