/**
 * OKX-shape regression tests. The synthetic helpers in helpers.ts build
 * time-ASCENDING series, which is exactly why 58 tests shipped green while
 * every live indicator consumed OKX's NEWEST-FIRST candles un-reversed
 * (ensemble scored 0 on BTC/ETH/DOGE in production). These tests feed OKX's
 * real wire shape — string-field rows, newest first, funding history as
 * objects — through the real client boundary and assert the values equal the
 * ascending-series expectations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atr, bollinger, ensembleScore, returnOverBars, rsi, zScore } from "@/lib/indicators";
import { fetchCandleSeries, parseFundingHistoryRows, tickerVolumeUsd } from "@/lib/okx/client";
import { refreshCoin } from "@/lib/okx/aggregator";

/** A strictly rising close series, oldest first. */
function chronologicalCloses(n: number, start = 100, step = 1): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step);
}

/** Candle rows exactly as OKX sends them: string fields, NEWEST first. */
function okxRowsNewestFirst(chronological: number[]): string[][] {
  const rows = chronological.map((c, i) => [
    String(Date.UTC(2026, 8, 26) + i * 900_000),
    String(c - 1),
    String(c + 1),
    String(c - 2),
    String(c),
    "123",
  ]);
  return rows.reverse();
}

function rowToBar(row: string[]): { h: number; l: number; c: number } {
  return { h: Number(row[2]), l: Number(row[3]), c: Number(row[4]) };
}

const fetchMock = vi.fn<typeof fetch>();
const realFetch = globalThis.fetch;

function reply(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
}
function okxJson(data: unknown): Response {
  return reply({ code: "0", data });
}
function candlesResponse(chronological: number[]): Response {
  return okxJson(okxRowsNewestFirst(chronological));
}

beforeEach(() => {
  globalThis.fetch = fetchMock as typeof fetch;
  fetchMock.mockReset();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("orientation contract: fetchCandleSeries", () => {
  it("reverses OKX's newest-first rows into chronological order", async () => {
    const chron = chronologicalCloses(12);
    fetchMock.mockResolvedValueOnce(candlesResponse(chron));
    const series = await fetchCandleSeries("BTC-USDT-SWAP", "15m", 300);
    expect(series.map((b) => b.c)).toEqual(chron);
  });

  it("pages history-candles for long windows and stays chronological", async () => {
    const chron = chronologicalCloses(310);
    fetchMock
      .mockImplementationOnce(async () => okxJson(okxRowsNewestFirst(chron.slice(-300))))
      .mockImplementationOnce(async () => okxJson(okxRowsNewestFirst(chron.slice(0, 10))));
    const series = await fetchCandleSeries("BTC-USDT-SWAP", "4H", 310);
    expect(series.map((b) => b.c)).toEqual(chron);
  });

  it("degrades loudly (warn) but keeps the freshest bars when history paging fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const chron = chronologicalCloses(305);
    fetchMock
      .mockImplementationOnce(async () => okxJson(okxRowsNewestFirst(chron.slice(-300))))
      .mockImplementationOnce(async () => reply({ code: "50011", data: [] }, 429));
    const series = await fetchCandleSeries("BTC-USDT-SWAP", "1D", 305);
    expect(series.map((b) => b.c)).toEqual(chron.slice(-300));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("indicators fed OKX's newest-first wire shape", () => {
  it("pin the shipped bug: un-reversed rows read a rally as a crash", () => {
    const chron = chronologicalCloses(400);
    const newestFirst = okxRowsNewestFirst(chron);
    const barsNewestFirst = newestFirst.map(rowToBar);
    // The failure mode the old code had: feeding newest-first rows unchanged
    // makes a monotone uptrend score -9 (the live probe saw 0s on mixed data).
    expect(ensembleScore(barsNewestFirst.map((b) => b.c))).toBe(-9);
    // After the client's orientation contract, the same numbers score +9.
    expect(ensembleScore(newestFirst.slice().reverse().map(rowToBar).map((b) => b.c))).toBe(9);
    // And chronologically-fed indicators equal the direct ascending expectations.
    const barsChronological = newestFirst.slice().reverse().map(rowToBar);
    expect(rsi(barsChronological.map((b) => b.c))).toBeCloseTo(rsi(chron)!, 12);
    expect(atr(barsChronological)).toBeCloseTo(atr(chron.map((c) => ({ h: c + 1, l: c - 2, c }))), 12);
    expect(bollinger(barsChronological.map((b) => b.c))!.pctB).toBeCloseTo(bollinger(chron)!.pctB, 12);
  });
});

describe("funding history shape", () => {
  it("parses OKX object rows (newest first) into chronological numeric rows", () => {
    const newestFirst = [
      { fundingRate: "0.00002", fundingTime: "1790467200000" },
      { fundingRate: "0.00001", fundingTime: "1790438400000" },
    ];
    const rows = parseFundingHistoryRows(newestFirst);
    expect(rows.map((r) => r.fundingRate)).toEqual([0.00001, 0.00002]);
    expect(rows.map((r) => r.fundingTime)).toEqual([1790438400000, 1790467200000]);
  });
  it("drops unparsable rows instead of poisoning the z-score", () => {
    const rows = parseFundingHistoryRows([
      { fundingRate: "", fundingTime: "1790438400000" },
      { fundingRate: "0.00003", fundingTime: "1790410000000" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].fundingRate).toBe(0.00003);
  });
});

describe("refreshCoin over the real client boundary", () => {
  const chron15 = chronologicalCloses(300, 100, 0.1);
  const chron4h = chronologicalCloses(400, 100, 0.05);
  const chronDaily = chronologicalCloses(9, 100, 1);
  const histObjs = Array.from({ length: 90 }, (_, i) => ({
    fundingRate: String(0.0001 + (i - 45) * 1e-7),
    fundingTime: String(1790438400000 - i * 8 * 3_600_000),
  }));

  function mockOkxHappyPath() {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/v5/market/history-candles")) return okxJson(okxRowsNewestFirst(chron4h.slice(0, 100)));
      if (url.includes("/api/v5/market/candles")) {
        if (url.includes("bar=15m")) return candlesResponse(chron15);
        if (url.includes("bar=4H")) return candlesResponse(chron4h.slice(-300)); // market/candles caps at 300
        if (url.includes("bar=1D")) return candlesResponse(chronDaily);
      }
      if (url.includes("funding-rate-history")) return okxJson(histObjs);
      if (url.includes("funding-rate")) return okxJson([{ fundingRate: "0.0001", fundingTime: "1790467200000" }]);
      if (url.includes("open-interest")) return okxJson([{ oi: "123", oiCcy: "BTC" }]);
      throw new Error(`unexpected url ${url}`);
    });
  }

  it("produces correct indicator values from OKX's newest-first wire shape", async () => {
    mockOkxHappyPath();
    const snap = await refreshCoin("BTC-USDT-SWAP");
    expect(snap.ensemble).toBe(9); // monotone 4h uptrend — was 0 before the fix
    expect(snap.rsi).toBeCloseTo(rsi(chron15)!, 12);
    // Bars are o=c-1, h=c+1, l=c-2: today's open is the last bar's OPEN,
    // yesterday's range is (c+1)-(c-2) = 3.
    expect(snap.todayOpen).toBe(chronDaily[chronDaily.length - 1] - 1);
    expect(snap.prevRange).toBeCloseTo(3, 9);
    expect(snap.r7d).toBeCloseTo(returnOverBars(chronDaily, 7)!, 12);
    const chronoRates = histObjs.map((h) => Number(h.fundingRate)).reverse();
    expect(snap.fundingZ).toBeCloseTo(zScore([...chronoRates, 0.0001])!, 12);
  });

  it("keeps fundingZ null, and says why, when funding history fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/api/v5/market/history-candles")) return okxJson(okxRowsNewestFirst(chron4h.slice(0, 100)));
      if (url.includes("/api/v5/market/candles")) {
        if (url.includes("bar=15m")) return candlesResponse(chron15);
        if (url.includes("bar=4H")) return candlesResponse(chron4h);
        if (url.includes("bar=1D")) return candlesResponse(chronDaily);
      }
      if (url.includes("funding-rate-history")) return reply({ code: "50001", data: [] }, 500);
      if (url.includes("funding-rate")) return okxJson([{ fundingRate: "0.0001", fundingTime: "1790467200000" }]);
      if (url.includes("open-interest")) return okxJson([{ oi: "123", oiCcy: "BTC" }]);
      throw new Error(`unexpected url ${url}`);
    });
    const snap = await refreshCoin("BTC-USDT-SWAP");
    expect(snap.fundingZ).toBeNull();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("funding history unavailable"))).toBe(true);
    warn.mockRestore();
  });
});

describe("tickerVolumeUsd", () => {
  it("prefers quote volume and falls back to base x price", () => {
    expect(tickerVolumeUsd({ instId: "X-USDT-SWAP", last: "2", askPx: "2", bidPx: "2", volCcy24h: "100", volCcyQuote24h: "500" })).toBe(500);
    expect(tickerVolumeUsd({ instId: "X-USDT-SWAP", last: "2", askPx: "2", bidPx: "2", volCcy24h: "100" })).toBe(200);
  });
});
