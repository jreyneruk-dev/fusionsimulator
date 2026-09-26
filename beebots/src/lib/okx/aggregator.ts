/**
 * Builds the per-coin MarketSnapshot map from OKX public data.
 * Heavy per-coin indicator fetches are cached (default 5 min); tickers are
 * refreshed every call so held positions keep moving every tick.
 *
 * All series arrive CHRONOLOGICAL (oldest first) per the client's orientation
 * contract; indicators are only ever fed time-ascending data.
 */

import type { MarketData, MarketSnapshot } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { rsi, bollinger, atr, donchianPct, ensembleScore, returnOverBars, zScore } from "@/lib/indicators";
import {
  fetchTickers,
  fetchCandleSeries,
  fetchFundingRate,
  fetchFundingHistory,
  fetchOpenInterest,
  tickerVolumeUsd,
  type FundingRow,
} from "@/lib/okx/client";

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Indicators computable from one chronological 15m candle series. */
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
    atrRaw: atr(bars),
    donchianPct: donchianPct(bars, 20),
    r1: returnOverBars(closes, 4), // 4 x 15m = 1h
    volZ: hourlyVols.length >= 8 ? zScore(hourlyVols) : null,
  };
}

/**
 * Per-coin indicator block. Optional per-fetch failures degrade to nulls with
 * a warning (deliberate, visible) — they never silently null a whole snapshot.
 */
export async function refreshCoin(
  instId: string,
  log: (line: string) => void = (l) => console.warn(l),
): Promise<Partial<MarketSnapshot>> {
  const [bars15m, bars4h, daily, funding, fundingRows, oi] = await Promise.all([
    fetchCandleSeries(instId, "15m", 300),
    fetchCandleSeries(instId, "4H", 400),
    fetchCandleSeries(instId, "1D", 9),
    fetchFundingRate(instId).catch((err) => {
      log(`[okx] ${instId}: funding-rate unavailable (${msg(err)}) — current funding and fundingZ withheld`);
      return null;
    }),
    fetchFundingHistory(instId, 90).catch((err) => {
      log(`[okx] ${instId}: funding history unavailable (${msg(err)}) — fundingZ withheld, Bizzy's funding veto is blind`);
      return [] as FundingRow[];
    }),
    fetchOpenInterest(instId).catch((err) => {
      log(`[okx] ${instId}: open interest unavailable (${msg(err)}) — OI change withheld`);
      return null;
    }),
  ]);

  const m15 = from15m(bars15m);
  const closes4h = bars4h.map((b) => b.c);
  const dailyCloses = daily.map((b) => b.c);

  // Chronological: the last bars are the present.
  const last15 = bars15m[bars15m.length - 1];
  const last4h = bars4h[bars4h.length - 1];
  const atr4h = atr(bars4h);
  const todayOpen = daily.length ? daily[daily.length - 1].o : null;
  const prevRange = daily.length >= 2 ? daily[daily.length - 2].h - daily[daily.length - 2].l : null;

  const frNow = funding ? Number(funding.fundingRate) : NaN;
  // 30-day funding z (Bizzy's Z2 veto): history + the current rate, chronological.
  const fundingSeries = Number.isFinite(frNow) ? [...fundingRows.map((r) => r.fundingRate), frNow] : fundingRows.map((r) => r.fundingRate);

  return {
    todayOpen,
    prevRange,
    rsi: m15.rsi,
    pctB: m15.pctB,
    atrPct: m15.atrRaw && last15 ? (m15.atrRaw / last15.c) * 100 : null,
    atr4hPct: atr4h && last4h ? (atr4h / last4h.c) * 100 : null,
    donchianPct: m15.donchianPct,
    ensemble: ensembleScore(closes4h),
    r24: returnOverBars(bars15m.map((b) => b.c), 96), // 96 x 15m = 24h
    volZ: m15.volZ,
    r7d: dailyCloses.length >= 8 ? returnOverBars(dailyCloses, 7) : null,
    funding: Number.isFinite(frNow) ? frNow : null,
    fundingZ: fundingSeries.length >= 8 ? zScore(fundingSeries) : null,
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

  // Concurrency is deliberately capped: a 30-coin cold start otherwise fires
  // ~180 simultaneous OKX requests, which a playtest burst showed 429-throttling
  // on (BCH-USDT-SWAP).
  async function pooledRefresh(limit: number): Promise<(readonly [string, Partial<MarketSnapshot>])[]> {
    const out: (readonly [string, Partial<MarketSnapshot>])[] = [];
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, targets.length) }, async () => {
      while (cursor < targets.length) {
        const instId = targets[cursor++];
        try {
          out.push([instId, await refreshCoin(instId)] as const);
        } catch (err) {
          console.warn(`[okx] ${instId}: refresh failed (${msg(err)}) — snapshot empty for this tick`);
          out.push([instId, {}] as const);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    });
    await Promise.all(workers);
    return out;
  }
  const perCoin = await pooledRefresh(6);
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
      atr4hPct: extra.atr4hPct ?? null,
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
 * crypto USDT perps ranked by 24h volume. The blocklist policy comes from
 * cfg; per-style spread gates apply later, at menu time.
 */
export async function tradableUniverse(cfg: EngineConfig, limit: number): Promise<string[]> {
  const tickers = await fetchTickers();
  return tickers
    .filter((t) => t.instId.endsWith("-USDT-SWAP"))
    .filter((t) => !cfg.nonCryptoBlocklist.has(t.instId.split("-")[0].toUpperCase()))
    .filter((t) => tickerVolumeUsd(t) >= cfg.min24hVolUsd)
    .sort((a, b) => tickerVolumeUsd(b) - tickerVolumeUsd(a))
    .slice(0, limit)
    .map((t) => t.instId.split("-")[0]);
}
