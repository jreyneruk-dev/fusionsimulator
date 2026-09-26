/**
 * OKX public market data client (EEA site, no API keys).
 * Mirrors what imikerussell/beebots pulls through OKX's open-source Agent Trade
 * Kit public REST client (MIT): instruments, tickers, candles, funding, OI.
 * Endpoints are unauthenticated public market data.
 */

const BASE = process.env.OKX_API_BASE || "https://eea.okx.com";

async function get(path: string, params: Record<string, string | number | undefined>): Promise<unknown[]> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`OKX ${path} HTTP ${res.status}`);
  const body = (await res.json()) as { code: string; data: unknown[] };
  if (body.code !== "0") throw new Error(`OKX ${path} code ${body.code}`);
  return body.data ?? [];
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

/** Candles: newest first, [ts, o, h, l, c, vol, ...]. */
export async function fetchCandles(instId: string, bar: string, limit: number): Promise<string[][]> {
  const rows = (await get("/api/v5/market/candles", { instId, bar, limit })) as string[][];
  return rows;
}

export async function fetchFundingRate(instId: string): Promise<{ fundingRate: string; fundingTime: string } | null> {
  const rows = (await get("/api/v5/public/funding-rate", { instId })) as { fundingRate: string; fundingTime: string }[];
  return rows[0] ?? null;
}

/** Funding-rate history: newest first, [ts, fundingRate, realizedRate, ...]. */
export async function fetchFundingHistory(instId: string, limit = 90): Promise<string[][]> {
  return (await get("/api/v5/public/funding-rate-history", { instId, limit })) as string[][];
}

export async function fetchOpenInterest(instId: string): Promise<{ oi: string; oiCcy?: string } | null> {
  const rows = (await get("/api/v5/public/open-interest", { instType: "SWAP", instId })) as { oi: string; oiCcy?: string }[];
  return rows[0] ?? null;
}
