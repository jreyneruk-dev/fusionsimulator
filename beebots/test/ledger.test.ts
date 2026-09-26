import { describe, expect, it } from "vitest";
import { addToPosition, closePosition, equityOf, fundingBoundariesBetween, fundingDueUsd, openPosition, spreadCostUsd, unrealisedPnl } from "@/lib/ledger";
import { bee, market, snapshot } from "./helpers";

const M = market({ "BTC-USDT-SWAP": snapshot({ last: 100, spreadBps: 2 }) });
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

describe("spread + fees", () => {
  it("prices spread cost in bps", () => {
    expect(spreadCostUsd(666, 15)).toBeCloseTo(0.999, 6);
  });
  it("charges taker on open and close", () => {
    const b = bee({ beeId: "waggle", style: "breakout" });
    const { bee: opened, fill } = openPosition(b, "BTC-USDT-SWAP", "long", 200, M, NOW);
    expect(fill.feeUsd).toBeCloseTo(200 * 0.0005, 9);
    expect(fill.spreadCostUsd).toBeCloseTo(200 * 2 / 10_000, 9);
    const { bee: closed, fill: closeFill } = closePosition(opened, 1, M, NOW + 1000);
    expect(closeFill.feeUsd).toBeCloseTo(200 * 0.0005, 9);
    expect(closed.position).toBeNull();
  });
});

describe("pnl", () => {
  it("realizes pnl on close and keeps it after", () => {
    const b = bee({ beeId: "waggle", style: "breakout" });
    const { bee: opened } = openPosition(b, "BTC-USDT-SWAP", "long", 200, M, NOW);
    const up = market({ "BTC-USDT-SWAP": snapshot({ last: 110 }) });
    const { bee: closed, fill } = closePosition(opened, 1, up, NOW + 1000);
    expect(fill.realizedPnlUsd).toBeCloseTo(((110 - 100) / 100) * 200, 6);
    expect(closed.realizedPnl).toBeCloseTo(20, 6);
  });
  it("marks shorts in the opposite direction", () => {
    const b = bee({ beeId: "hover", style: "trend" });
    const { bee: opened } = openPosition(b, "BTC-USDT-SWAP", "short", 200, M, NOW);
    const down = market({ "BTC-USDT-SWAP": snapshot({ last: 90 }) });
    expect(unrealisedPnl(opened, down)).toBeCloseTo(((100 - 90) / 100) * 200, 6);
    expect(unrealisedPnl(opened, M)).toBeCloseTo(0, 6); // mark equals entry
  });
  it("adds at a weighted average entry", () => {
    const b = bee({ beeId: "sting", style: "momentum" });
    const { bee: opened } = openPosition(b, "BTC-USDT-SWAP", "long", 100, M, NOW);
    const higher = market({ "BTC-USDT-SWAP": snapshot({ last: 200 }) });
    const { bee: added } = addToPosition(opened, 100, higher, NOW + 1000);
    expect(added.position!.notionalUsd).toBeCloseTo(200, 6);
    expect(added.position!.entryPrice).toBeCloseTo((100 * 100 + 200 * 100) / 200, 6);
  });
  it("handles a partial close (trim half)", () => {
    const b = bee({ beeId: "waggle", style: "breakout" });
    const { bee: opened } = openPosition(b, "BTC-USDT-SWAP", "long", 200, M, NOW);
    const { bee: trimmed, closed } = closePosition(opened, 0.5, M, NOW + 1000);
    expect(closed).toBe(false);
    expect(trimmed.position!.notionalUsd).toBeCloseTo(100, 6);
  });
});

describe("equity", () => {
  it("is start + realized + unrealised - costs", () => {
    const b = bee({ beeId: "waggle", style: "breakout", realizedPnl: 5, feesPaid: 1, spreadPaid: 0.5, fundingPaid: 0.25 });
    const { bee: opened } = openPosition(bee({ beeId: "x", style: "breakout" }), "BTC-USDT-SWAP", "long", 0.0000001, M, NOW);
    void opened;
    expect(equityOf(b, M)).toBeCloseTo(333 + 5 - 1 - 0.5 - 0.25, 6);
  });
});

describe("funding", () => {
  it("counts 00/08/16 UTC boundaries between two timestamps", () => {
    const from = Date.UTC(2026, 8, 26, 7, 0, 0);
    const to = Date.UTC(2026, 8, 26, 17, 0, 0);
    // boundaries at 08:00 and 16:00
    expect(fundingBoundariesBetween(from, to)).toBe(2);
  });
  it("counts zero inside one interval and none backwards", () => {
    const from = Date.UTC(2026, 8, 26, 1, 0, 0);
    const to = Date.UTC(2026, 8, 26, 7, 0, 0);
    expect(fundingBoundariesBetween(from, to)).toBe(0);
    expect(fundingBoundariesBetween(to, from)).toBe(0);
  });
  it("charges longs positive funding and pays shorts", () => {
    const long = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 600, entryPrice: 100, entryTs: 0, leverage: 2 };
    const short = { ...long, side: "short" as const };
    const from = Date.UTC(2026, 8, 26, 7, 0, 0);
    const to = Date.UTC(2026, 8, 26, 9, 0, 0); // one boundary (08:00)
    const rate = 0.0001;
    expect(fundingDueUsd(long, rate, from, to)).toBeCloseTo(600 * rate, 9);
    expect(fundingDueUsd(short, rate, from, to)).toBeCloseTo(-600 * rate, 9);
  });
});
