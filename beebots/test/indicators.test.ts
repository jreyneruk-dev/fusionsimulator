import { describe, expect, it } from "vitest";
import { atr, bollinger, ensembleScore, macd, returnOverBars, rsi, zScore } from "@/lib/indicators";

describe("rsi", () => {
  it("reads overbought in a rally and oversold in a dump", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 200 - i);
    expect(rsi(up)!).toBeGreaterThan(70);
    expect(rsi(down)!).toBeLessThan(30);
  });
  it("is 50 on a flat series", () => {
    expect(rsi(Array(30).fill(100))!).toBeCloseTo(50, 5);
  });
  it("returns null without enough data", () => {
    expect(rsi([1, 2, 3])).toBeNull();
  });
});

describe("bollinger", () => {
  it("puts an above-band close above 1.0 %B", () => {
    const closes = Array.from({ length: 20 }, () => 100);
    closes.push(120);
    const bb = bollinger(closes)!;
    expect(bb.pctB).toBeGreaterThan(1);
  });
  it("is null with too little data", () => {
    expect(bollinger([1, 2])).toBeNull();
  });
});

describe("atr", () => {
  it("computes the true range average", () => {
    const bars = [
      { h: 12, l: 10, c: 11 },
      { h: 15, l: 11, c: 14 },
      { h: 14, l: 12, c: 13 },
      { h: 13, l: 11.5, c: 12 },
      { h: 14, l: 12.5, c: 13.5 },
    ];
    // TRs with gaps: 4, 2, 1.5, 2 -> Wilder seed over period 4 = 2.375
    expect(atr(bars, 4)).toBeCloseTo(2.375, 6);
  });
});

describe("macd", () => {
  it("is positive in an uptrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    expect(macd(closes)!.macd).toBeGreaterThan(0);
  });
});

describe("ensembleScore", () => {
  it("is +9 in a clean uptrend and -9 in a clean downtrend", () => {
    const up = Array.from({ length: 400 }, (_, i) => 100 + i * 0.1);
    const down = Array.from({ length: 400 }, (_, i) => 200 - i * 0.1);
    expect(ensembleScore(up)).toBe(9);
    expect(ensembleScore(down)).toBe(-9);
  });
  it("needs at least 360 lookback bars", () => {
    expect(ensembleScore(Array.from({ length: 100 }, (_, i) => 100 + i))).toBeNull();
  });
});

describe("zScore", () => {
  it("flags the last outlier", () => {
    const series = [...Array(20).fill(10), 30];
    expect(zScore(series)!).toBeGreaterThan(2);
  });
});

describe("returnOverBars", () => {
  it("computes simple returns", () => {
    expect(returnOverBars([100, 101, 102, 103, 104], 4)).toBeCloseTo(0.04, 6);
    expect(returnOverBars([1, 2], 5)).toBeNull();
  });
});
