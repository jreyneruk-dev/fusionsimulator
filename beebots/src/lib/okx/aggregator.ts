/**
 * Builds the per-coin MarketSnapshot map from OKX public data.
 * Heavy per-coin indicator fetches are cached (default 5 min); tickers are
 * refreshed every call so held positions keep moving every tick.
 */

import type { MarketData, MarketSnapshot } from "@/lib/types";
import { rsi, bollinger, atr, donchianPct, ensembleScore, returnOverBars, zScore } from "@/lib/indicators";
import {
  fetchTickers,
  fetchCandles,
  fetchFundingRate,
  fetchFundingHistory,
  fetchOpenInterest,
  tickerVolumeUsd,
} from "@/lib/okx/client";

/** Base symbols excluded from the crypto-only universe (extend via NON_CRYPTO_BLOCKLIST). */
const DEFAULT_BLOCKLIST = "NVDA,OPENAI,ANTHROPIC,XAU,CL,TSLA,META,GOOGL,AMZN,SPY";

export const NON_CRYPTO = new Set(
  (process.env.NON_CRYPTO_BLOCKLIST || DEFAULT_BLOCKLIST).split(",").map((s) => s.trim().toUpperCase()),
);

const num = (v: string | undefined) => (v === undefined ? NaN : Number(v));
void num;

async function candles(instId: string, bar: string, limit: number): Promise<{ h: number; l: number; c: number; o: number; v: number; ts: number }[]> {
  let rows = await fetchCandles(instId, bar, Math.min(limit, 300));
  if (rows.length >= 300 && limit > 300) {
    const older = await fetchCandlesHistory(instId, bar, Number(rows[rows.length - 1][0]), limit - 300);
    rows = rows.concat(older);
  }
  return rows
    .map((r) => ({ ts: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }))
    .filter((b) => Number.isFinite(b.c));
}

async function fetchCandlesHistory(instId: string, bar: string, afterTs: number, limit: number): Promise<string[][]> {
  const url = new URL("/api/v5/market/history-candles", process.env.OKX_API_BASE || "https://eea.okx.com");
  url.searchParams.set("instId", instId);
  url.searchParams.set("bar", bar);
  url.searchParams.set("after", String(afterTs));
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { code: string; data: string[][] };
  return body.code === "0" ? (body.data ?? []) : [];
}

/** Indicators computable from one 15m candle series. */
function from15m(bars: { h: number; l: number; c: number; v: number }[]) {
  const closes = bars.map((b) => b.c);
  const bb = bollinger(closes);
  // Hourly volume buckets (4 x 15m), for the attention z-score.
  const hourlyVols: number[] = [];
  for (let i = 0; i + 3 < bars.length; i += 4) {
    hourlyVols.push(bars[i].v + bars[i + 1].v + bars[i + 2].v + bars[i + 3].v);
  }
  return {
    rsi: rsi(closes),
    pctB: bb ? bb.pctB : null,
    atrPctRaw: atr(bars),
    donchianPct: donchianPct(bars, 20),
    r1: returnOverBars(closes, 4), // 4 x 15m = 1h
    volZ: hourlyVols.length >= 8 ? zScore(hourlyVols) : null,
  };
}

export async function refreshCoin(
  instId: string,
): Promise<Partial<MarketSnapshot>> {
  const [bars15m, bars4h, daily, funding, fundHist, oi] = await Promise.all([
    candles(instId, "15m", 300),
    candles(instId, "4H", 400),
    candles(instId, "1D", 9),
    fetchFundingRate(instId).catch(() => null),
    fetchFundingHistory(instId, 90).catch(() => []),
    fetchOpenInterest(instId).catch(() => null),
  ]);

  const m15 = from15m(bars15m);
  const closes4h = bars4h.map((b) => b.c);
  const atr15 = m15.atrPctRaw;

  // 24h return from the 15m closes (96 bars = 24h) when the daily list is short.
  const r24 = returnOverBars(bars15m.map((b) => b.c).reverse(), 96);

  // Yesterday's range and today's UTC open from daily bars (newest first).
  let todayOpen: number | null = null;
  let prevRange: number | null = null;
  if (daily.length >= 2) {
    todayOpen = daily[0].o;
    prevRange = daily[1].h - daily[1].l;
  }

  const fundingRates = fundHist.map((r) => Number(r[1])).filter(Number.isFinite);
  const frNow = funding ? Number(funding.fundingRate) : NaN;

  return {
    todayOpen,
    prevRange,
    rsi: m15.rsi,
    pctB: m15.pctB,
    atrPct: atr15 && bars15m.length ? (atr15 / bars15m[bars15m.length - 1].c) * 100 : null,
    donchianPct: m15.donchianPct,
    ensemble: ensembleScore(closes4h),
    r24,
    volZ: m15.volZ,
    r7d: daily.length >= 8 ? returnOverBars(daily.map((b) => b.c).reverse(), 7) : null,
    funding: Number.isFinite(frNow) ? frNow : null,
    fundingZ: fundingRates.length ? zScore([...fundingRates].reverse().concat(Number.isFinite(frNow) ? [frNow] : [])) : null,
    oi: oi ? Number(oi.oi) : null,
  };
}

/** Full refresh: tickers + per-coin indicator blocks for the given coin list. */
export async function fullRefresh(coins: string[], prev?: MarketData): Promise<MarketData> {
  const tickers = await fetchTickers();
  const byTicker = new Map(tickers.map((t) => [t.instId, t]));
  const universe = new Set(coins.map((c) => `${c}-USDT-SWAP`));

  const byInst: Record<string, MarketSnapshot> = {};
  const targets = [...universe].filter((instId) => byTicker.has(instId));

  const perCoin = await Promise.all(
    targets.map(async (instId) => {
      try {
        return [instId, await refreshCoin(instId)] as const;
      } catch {
        return [instId, {}] as const;
      }
    }),
  );
  const perCoinMap = new Map(perCoin);

  // 1h OI change needs the previous OI reading; persisted by the caller.
  for (const instId of targets) {
    const t = byTicker.get(instId)!;
    const last = Number(t.last);
    const ask = Number(t.askPx);
    const bid = Number(t.bidPx);
    const mid = (ask + bid) / 2 || last;
    const extra = perCoinMap.get(instId) ?? {};
    const prevOi = prev?.byInst[instId]?.oi ?? null;
    const oiNow = extra.oi ?? null;
    byInst[instId] = {
      instId,
      last,
      spreadBps: mid > 0 ? ((ask - bid) / mid) * 10_000 : 0,
      vol24hUsd: tickerVolumeUsd(t),
      r1: extra.r1 ?? null,
      r24: extra.r24 ?? null,
      r7d: extra.r7d ?? null,
      rsi: extra.rsi ?? null,
      pctB: extra.pctB ?? null,
      atrPct: extra.atrPct ?? null,
      donchianPct: extra.donchianPct ?? null,
      ensemble: extra.ensemble ?? null,
      funding: extra.funding ?? null,
      fundingZ: extra.fundingZ ?? null,
      oiChange1h: prevOi && oiNow ? oiNow / prevOi - 1 : null,
      volZ: extra.volZ ?? null,
      todayOpen: extra.todayOpen ?? null,
      prevRange: extra.prevRange ?? null,
      oi: oiNow,
    };
  }
  return { ts: Date.now(), byInst };
}

/** Ticker-only patch: fresh prices/spreads/volumes, indicators carried over. */
export async function tickerPatch(prev: MarketData): Promise<MarketData> {
  const tickers = await fetchTickers();
  const byTicker = new Map(tickers.map((t) => [t.instId, t]));
  const byInst: Record<string, MarketSnapshot> = {};
  for (const [instId, s] of Object.entries(prev.byInst)) {
    const t = byTicker.get(instId);
    if (!t) {
      byInst[instId] = s;
      continue;
    }
    const last = Number(t.last);
    const ask = Number(t.askPx);
    const bid = Number(t.bidPx);
    const mid = (ask + bid) / 2 || last;
    const sodUtc0 = Number(t.sodUtc0 ?? "");
    const r24 = Number.isFinite(sodUtc0) && sodUtc0 > 0 ? last / sodUtc0 - 1 : s.r24;
    byInst[instId] = {
      ...s,
      last,
      spreadBps: mid > 0 ? ((ask - bid) / mid) * 10_000 : s.spreadBps,
      vol24hUsd: tickerVolumeUsd(t),
      r24,
    };
  }
  return { ts: Date.now(), byInst };
}

/**
 * Tradable universe for this tick, straight from public tickers: liquid
 * crypto USDT perps (stock/commodity tokens excluded), ranked by 24h volume.
 * This is the coin list indicators get fetched for; the per-style spread
 * gates then apply at menu time.
 */
export async function tradableUniverse(minVol: number, limit: number): Promise<string[]> {
  const tickers = await fetchTickers();
  return tickers
    .filter((t) => t.instId.endsWith("-USDT-SWAP"))
    .filter((t) => !NON_CRYPTO.has(t.instId.split("-")[0].toUpperCase()))
    .filter((t) => tickerVolumeUsd(t) >= minVol)
    .sort((a, b) => tickerVolumeUsd(b) - tickerVolumeUsd(a))
    .slice(0, limit)
    .map((t) => t.instId.split("-")[0]);
}
