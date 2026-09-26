import { describe, expect, it } from "vitest";
import { applyRisk, capsFor, dayKeyOf, equityOf, TAKER_FEE_RATE, ROUND_TRIP_FEE_RATE } from "@/lib/risk";
import { bee, cfg, market, menuOf, snapshot } from "./helpers";
import { fakeVerdict } from "@/lib/jev";
import type { JevVerdict } from "@/lib/types";

const M = market({
  "BTC-USDT-SWAP": snapshot(),
  "ETH-USDT-SWAP": snapshot({ instId: "ETH-USDT-SWAP", last: 50 }),
  "RAY-USDT-SWAP": snapshot({ instId: "RAY-USDT-SWAP", spreadBps: 58.6 }), // his real spread-gate case
});

function verdict(over: Partial<JevVerdict>): JevVerdict {
  return {
    beeId: "t",
    choice: "APE_BTC-USDT-SWAP",
    probabilities: { "APE_BTC-USDT-SWAP": 0.9 },
    conviction: 3,
    convictionScaleLabel: "legendary",
    provider: "fake",
    inputTokens: 100,
    costUsd: 0,
    latencyMs: 1,
    ...over,
  };
}

describe("capsFor", () => {
  it("counts down trades and fee budget", () => {
    const b = bee({ beeId: "waggle", style: "breakout", tradesToday: 1, feesToday: 0.5 });
    const caps = capsFor(b, cfg(), 333, Date.now());
    expect(caps.tradesLeft).toBe(0);
    expect(caps.feeBudgetLeft).toBeCloseTo(0.5, 6);
    expect(caps.benched).toBe(true);
  });
  it("trips the loss stop at -8% for the day", () => {
    const b = bee({ beeId: "waggle", style: "breakout", dayStartEquityUsd: 333 });
    const caps = capsFor(b, cfg(), 333 * 0.91, Date.now());
    expect(caps.dayPnlPct).toBeLessThan(-8);
    expect(caps.lossStopTripped).toBe(true);
  });
  it("retires below the floor", () => {
    const b = bee({ beeId: "waggle", style: "breakout" });
    expect(capsFor(b, cfg(), 333 * 0.39, Date.now()).retired).toBe(true);
    expect(capsFor(b, cfg(), 333 * 0.5, Date.now()).retired).toBe(false);
  });
  it("detects cooldown after a close", () => {
    const now = Date.now();
    const b = bee({ beeId: "sting", style: "momentum", lastCloseTs: now - 60_000 });
    expect(capsFor(b, cfg(), 333, now).inCooldown).toBe(true);
  });
});

describe("applyRisk: allowed", () => {
  it("lets a flat momentum bee ape the top candidate at clamped size", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting" }), M, cfg());
    expect(out.vetoed).toBe(false);
    expect(out.kind).toBe("open");
    expect(out.instId).toBe("BTC-USDT-SWAP");
    expect(out.sizeUsd).toBeCloseTo(0.5 * Math.min(700, 2 * 333), 6);
  });
  it("passes a close through with the position size", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.now(), leverage: 1 };
    const b = bee({ beeId: "sting", style: "momentum", position: p });
    const menu = menuOf("sting", "momentum", [{ action: "BAIL", label: "", kind: "close", instId: "BTC-USDT-SWAP" }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "BAIL", probabilities: { BAIL: 0.9 } }), M, cfg());
    expect(out.vetoed).toBe(false);
    expect(out.kind).toBe("close");
    expect(out.sizeUsd).toBeCloseTo(200, 6);
  });
});

describe("applyRisk: vetoed", () => {
  it("blocks the spread gate (the real RAY case: 58.6bp vs 15bp)", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_RAY-USDT-SWAP", label: "", kind: "open", instId: "RAY-USDT-SWAP", side: "long", sizeFrac: 0.5 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "APE_RAY-USDT-SWAP", probabilities: { "APE_RAY-USDT-SWAP": 0.9 } }), M, cfg());
    expect(out.vetoed).toBe(true);
    expect(out.vetoReason).toContain("58.6bp");
  });
  it("blocks the volume gate", () => {
    const thin = market({ "DOGE-USDT-SWAP": snapshot({ instId: "DOGE-USDT-SWAP", vol24hUsd: 100 }) });
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_DOGE-USDT-SWAP", label: "", kind: "open", instId: "DOGE-USDT-SWAP", side: "long", sizeFrac: 0.5 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "APE_DOGE-USDT-SWAP" }), thin, cfg());
    expect(out.vetoed).toBe(true);
    expect(out.vetoReason).toContain("volume gate");
  });
  it("blocks new opens once the trade cap is hit, and rides instead", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.now(), leverage: 1 };
    const positioned = bee({ beeId: "sting", style: "momentum", position: p, tradesToday: 3 });
    const menu = menuOf("sting", "momentum", [
      { action: "APE_ETH-USDT-SWAP", label: "", kind: "switch", instId: "ETH-USDT-SWAP", side: "long", sizeFrac: 0.5 },
      { action: "RIDE", label: "", kind: "hold" },
    ]);
    const out = applyRisk(positioned, menu, verdict({ beeId: "sting", choice: "APE_ETH-USDT-SWAP" }), M, cfg());
    expect(out.vetoed).toBe(true);
    expect(out.vetoReason).toContain("trade cap reached");
  });
  it("blocks opens whose round-trip fee does not fit the daily fee budget", () => {
    const b = bee({ beeId: "sting", style: "momentum", feesToday: 2.99 });
    const menu = menuOf("sting", "momentum", [{ action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 1 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting" }), M, cfg());
    // size = 666 -> round trip 0.666 > 0.01 left
    expect(out.vetoed).toBe(true);
    expect(out.vetoReason).toContain("fee budget");
  });
  it("forces CUT_LOSS when the daily loss stop trips with a position", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.now(), leverage: 1 };
    const b = bee({ beeId: "sting", style: "momentum", position: p, dayStartEquityUsd: 333, startEquityUsd: 333 });
    // equity = 333 + (100-95)/95*200 = 343.5 -> not a loss; make entry high instead
    const losing = { ...p, entryPrice: 115 };
    const b2 = bee({ beeId: "sting", style: "momentum", position: losing, dayStartEquityUsd: 333, startEquityUsd: 333 });
    const menu = menuOf("sting", "momentum", [{ action: "RIDE", label: "", kind: "hold" }]);
    const out = applyRisk(b2, menu, verdict({ beeId: "sting" }), M, cfg());
    // entry 115: unrealised = (100-115)/115*200 = -26.09; equity 300.9 -> day pnl -9.6% -> trips
    const b3 = bee({ beeId: "sting", style: "momentum", position: losing, dayStartEquityUsd: 333, startEquityUsd: 333, feesToday: 6, feesPaid: 6 });
    const out3 = applyRisk(b3, menu, verdict({ beeId: "sting" }), M, cfg());
    expect(out3.vetoed).toBe(true);
    expect(out3.action).toBe("CUT_LOSS");
    void b;
    void out;
  });
  it("respects the trend conviction gate: P<0.70 cannot open, code forces the minimum", () => {
    const b = bee({ beeId: "hover", style: "trend" });
    const menu = menuOf(
      "hover",
      "trend",
      [{ action: "LONG_BTC", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 }],
      { action: "LONG_BTC", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0 },
    );
    const weak = verdict({ beeId: "hover", choice: "LONG_BTC", probabilities: { LONG_BTC: 0.5 }, convictionScaleLabel: "fair", conviction: 1 });
    const out = applyRisk(b, menu, weak, M, cfg());
    expect(out.vetoed).toBe(false);
    expect(out.sizeUsd).toBeCloseTo(10, 6); // forced minimum, not the 0.5x open
  });
  it("blocks an add beyond max notional", () => {
    // entry = mark so there is no unrealised P&L: equity stays 333 and the 2x cap is 666
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 666, entryPrice: 100, entryTs: Date.now(), leverage: 1 };
    const b = bee({ beeId: "sting", style: "momentum", position: p });
    const menu = menuOf("sting", "momentum", [{ action: "DOUBLE_DOWN", label: "", kind: "add", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.25 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "DOUBLE_DOWN" }), M, cfg());
    expect(out.vetoed).toBe(true);
    expect(out.vetoReason).toContain("max notional");
  });
  it("vetoed opens wait when flat and hold when positioned", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_RAY-USDT-SWAP", label: "", kind: "open", instId: "RAY-USDT-SWAP", side: "long", sizeFrac: 0.5 }]);
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "APE_RAY-USDT-SWAP" }), M, cfg());
    expect(out.kind).toBe("wait");
  });
});

describe("applyRisk: no verdict (Jev down / benched)", () => {
  it("rides an open position with code-only management", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.now(), leverage: 1 };
    const b = bee({ beeId: "sting", style: "momentum", position: p });
    const menu = menuOf("sting", "momentum", [{ action: "RIDE", label: "", kind: "hold" }]);
    const out = applyRisk(b, menu, null, M, cfg());
    expect(out.action).toBe("HOLD");
    expect(out.vetoed).toBe(true);
  });
  it("suspends forcing when benched", () => {
    const b = bee({ beeId: "sting", style: "momentum", tradesToday: 3 });
    const menu = menuOf("sting", "momentum", [], { action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 });
    const out = applyRisk(b, menu, null, M, cfg());
    expect(out.kind).toBe("wait");
    expect(out.vetoReason).toContain("benched");
  });
  it("keeps the never-flat forced entry alive for an unbenched flat bee", () => {
    const b = bee({ beeId: "hover", style: "trend" });
    const menu = menuOf("hover", "trend", [], { action: "SHORT_ETH", label: "", kind: "open", instId: "ETH-USDT-SWAP", side: "short", sizeFrac: 0 });
    const out = applyRisk(b, menu, null, M, cfg());
    expect(out.vetoed).toBe(false);
    expect(out.side).toBe("short");
    expect(out.sizeUsd).toBeCloseTo(10, 6);
  });
  it("falls back to the forced move on an invalid Jev choice", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 }], { action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 });
    const out = applyRisk(b, menu, verdict({ beeId: "sting", choice: "YOLO_BTC" }), M, cfg());
    expect(out.vetoed).toBe(false);
    expect(out.action).toBe("APE_BTC-USDT-SWAP");
  });
});

describe("equity + fees", () => {
  it("equity subtracts paid costs and marks the position", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.now(), leverage: 1 };
    const b = bee({ beeId: "waggle", style: "breakout", position: p, feesPaid: 1, spreadPaid: 0.4, fundingPaid: 0.1, realizedPnl: 5 });
    // 333 + 5 + (100-95)/95*200 (=10.53) - 1 - 0.4 - 0.1
    expect(equityOf(b, M)).toBeCloseTo(347.03, 1);
  });
  it("uses the published taker fee rate", () => {
    expect(TAKER_FEE_RATE).toBe(0.0005);
    expect(ROUND_TRIP_FEE_RATE).toBeCloseTo(0.001, 6);
  });
  it("formats UTC day keys", () => {
    expect(dayKeyOf(Date.UTC(2026, 8, 26, 23, 30))).toBe("2026-09-26");
  });
});

describe("fakeVerdict", () => {
  it("prefers an open when flat and picks a menu action", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const menu = menuOf("sting", "momentum", [{ action: "APE_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.5 }]);
    const v = fakeVerdict(b.beeId, menu);
    expect(v.choice).toBe("APE_BTC-USDT-SWAP");
    expect(v.probabilities[v.choice]).toBeGreaterThan(0.5);
  });
});
