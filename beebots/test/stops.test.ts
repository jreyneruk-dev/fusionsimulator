/**
 * Strategy stops and the Z2 funding veto, both directions.
 * Doc sources are cited inline; see src/lib/stops.ts and risk.ts headers.
 */

import { describe, expect, it } from "vitest";
import { evaluateStops } from "@/lib/stops";
import { FUNDING_Z_BLOCK, fundingVeto, applyRisk } from "@/lib/risk";
import { runTick } from "@/lib/engine";
import type { EngineDeps } from "@/lib/engine";
import { fakeVerdict } from "@/lib/jev";
import { bee, cfg, market, menuOf, snapshot, verdict } from "./helpers";
import type { JevVerdict, Position } from "@/lib/types";

const NOW = Date.UTC(2026, 8, 26, 12);
const ET = Date.UTC(2026, 8, 25, 22); // entered yesterday (UTC)

const M = market({
  "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2 }),
});

function pos(over: Partial<Position> = {}): Position {
  return { instId: "BTC-USDT-SWAP", side: "long", notionalUsd: 200, entryPrice: 95, entryTs: NOW, leverage: 1, ...over };
}

describe("breakout stops (BIZZY_BEE.md live rules)", () => {
  it("closes when price falls back below today's open", () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: NOW }) });
    const down = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 89.5, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, down, cfg(), NOW)?.reason).toBe("breakout_open_stop");
  });
  it("holds while price is above today's open", () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: NOW }) });
    const above = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 90.1, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, above, cfg(), NOW)).toBeNull();
  });
  it("ends the ride after a UTC midnight (day close), even in profit", () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: ET }) });
    expect(evaluateStops(b, M, cfg(), NOW)?.reason).toBe("breakout_day_close");
  });
  it("keeps a same-day ride alive", () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: NOW - 3_600_000 }) });
    expect(evaluateStops(b, M, cfg(), NOW)).toBeNull();
  });
  it("does not apply the long-side open stop to a short breakout", () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ side: "short", entryPrice: 85, entryTs: NOW }) });
    const down = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 89.5, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, down, cfg(), NOW)).toBeNull();
  });
});

describe("trend stop (BREEZY_BEE.md: 2 x ATR(14) on 4h bars, trailing)", () => {
  it("trips after the trail is ratcheted up by a run", () => {
    // best 110 -> stop 110 * (1 - 0.04) = 105.6... with atr4hPct 2 and mult 2: dist 4%
    const b = bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 95, bestPrice: 110 }) });
    const pulled = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 105.5, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, pulled, cfg(), NOW)?.reason).toBe("trend_atr_trail");
  });
  it("holds inside the trail", () => {
    const b = bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 95, bestPrice: 110 }) });
    const above = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 108, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, above, cfg(), NOW)).toBeNull();
  });
  it("trips a short above its ratcheted floor", () => {
    // short from best 100 with a 4% trail: stop 104; a bounce to 104.5 breaches
    const b = bee({ beeId: "hover", style: "trend", position: pos({ side: "short", entryPrice: 105, bestPrice: 100 }) });
    const bounce = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 104.5, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, bounce, cfg(), NOW)?.reason).toBe("trend_atr_trail");
  });
  it("the ratchet only tightens: an anchored best raises the stop vs the raw entry", () => {
    const fresh = bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 105 }) }); // anchor 105 -> stop 100.8
    const run = bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 105, bestPrice: 110 }) }); // stop 105.6
    const pull = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 104, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(fresh, pull, cfg(), NOW)).toBeNull(); // 104 > 100.8
    expect(evaluateStops(run, pull, cfg(), NOW)?.reason).toBe("trend_atr_trail"); // 104 < 105.6
  });
  it("falls back to the 15m ATR when the 4h ATR is unavailable", () => {
    const b = bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 95, bestPrice: 110 }) });
    const noAtr4 = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 105.5, atrPct: 2, atr4hPct: null }) });
    expect(evaluateStops(b, noAtr4, cfg(), NOW)?.reason).toBe("trend_atr_trail");
  });
});

describe("momentum stop (BOOZY_BEE.md: stop and trail at 3 x ATR)", () => {
  it("trips beyond 3 ATR from the best price", () => {
    const b = bee({ beeId: "sting", style: "momentum", position: pos({ entryPrice: 100, bestPrice: 100 }) });
    const dumped = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 93.9, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, dumped, cfg(), NOW)?.reason).toBe("momentum_atr_trail");
  });
  it("holds exactly at the trail boundary", () => {
    const b = bee({ beeId: "sting", style: "momentum", position: pos({ entryPrice: 100, bestPrice: 100 }) });
    const edge = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 94, todayOpen: 90, atrPct: 2, atr4hPct: 2 }) });
    expect(evaluateStops(b, edge, cfg(), NOW)).toBeNull();
  });
});

describe("Z2 funding veto (BIZZY_BEE.md)", () => {
  it("blocks longs when funding z > 1.5", () => {
    expect(FUNDING_Z_BLOCK).toBe(1.5); // his published threshold
    const v = fundingVeto("BTC-USDT-SWAP", 1.6);
    expect(v.vetoed).toBe(true);
    expect(v.reason).toContain("Z2 funding veto");
  });
  it("passes at or below the threshold (strictly greater)", () => {
    expect(fundingVeto("BTC-USDT-SWAP", 1.5).vetoed).toBe(false);
    expect(fundingVeto("BTC-USDT-SWAP", 0.97).vetoed).toBe(false);
  });
  it("fails open when fundingZ is withheld, with a visible reason", () => {
    const v = fundingVeto("BTC-USDT-SWAP", null);
    expect(v.vetoed).toBe(false);
    expect(v.reason).toContain("withheld");
  });
  it("routes through applyRisk: vetoed flat waits; the same-coin re-open is an exempt add", () => {
    const hot = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2, fundingZ: 1.7 }) });
    const menu = menuOf("waggle", "breakout", [{ action: "LONG_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 1 }]);
    const flat = bee({ beeId: "waggle", style: "breakout" });
    expect(applyRisk(flat, menu, verdict("waggle", menu, { choice: "LONG_BTC-USDT-SWAP" }), hot, cfg(), NOW).vetoed).toBe(true);
    // Already long BTC: the choice changes net exposure by zero, so the veto
    // exempts it. The risk layer passes the option kind through; the engine is
    // what converts a same-coin open-kind choice into an add.
    const held = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, notionalUsd: 100 }) });
    const out = applyRisk(held, menu, verdict("waggle", menu, { choice: "LONG_BTC-USDT-SWAP" }), hot, cfg(), NOW);
    expect(out.vetoed).toBe(false);
    expect(out.instId).toBe("BTC-USDT-SWAP");
  });
  it("passes a breakout long when funding z is healthy", () => {
    const cool = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2, fundingZ: 1.2 }) });
    const menu = menuOf("waggle", "breakout", [{ action: "LONG_BTC-USDT-SWAP", label: "", kind: "open", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 1 }]);
    const out = applyRisk(bee({ beeId: "waggle", style: "breakout" }), menu, verdict("waggle", menu, { choice: "LONG_BTC-USDT-SWAP" }), cool, cfg(), NOW);
    expect(out.vetoed).toBe(false);
    expect(out.kind).toBe("open");
  });
  it("exempts adds to the same long (no change in net exposure)", () => {
    const hot = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2, fundingZ: 1.7 }) });
    const menu = menuOf("waggle", "breakout", [{ action: "LONG_BTC-USDT-SWAP", label: "", kind: "add", instId: "BTC-USDT-SWAP", side: "long", sizeFrac: 0.25 }]);
    const held = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, notionalUsd: 100 }) });
    const out = applyRisk(held, menu, verdict("waggle", menu, { choice: "LONG_BTC-USDT-SWAP" }), hot, cfg(), NOW);
    expect(out.vetoed).toBe(false);
  });
});

describe("engine wiring: stops run for benched bees and route through the ledger", () => {
  it("closes a benched breakout on the open stop with a real paper fill and no Jev call", async () => {
    const b = bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: NOW }), tradesToday: 1 }); // cap = 1 -> benched
    const down = market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 89.5, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2, funding: 0.0001 }) });
    let asked = 0;
    const out = await runTick({
      bees: [b],
      market: down,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: NOW,
      deps: {
        ask: async (batch) => {
          asked += batch.length;
          return batch.map(({ bee: bb, menu }) => fakeVerdict(bb.beeId, menu));
        },
      },
    });
    expect(asked).toBe(0); // benched: Jev never asked, but the stop still fired
    expect(out.fills).toHaveLength(1);
    expect(out.fills[0].kind).toBe("close");
    expect(out.fills[0].feeUsd).toBeCloseTo(out.fills[0].notionalUsd * 0.0005, 12); // taker, same ledger path
    expect(out.fills[0].spreadCostUsd).toBeGreaterThan(0);
    expect(out.decisions[0].finalAction).toBe("STOP_BREAKOUT_OPEN_STOP");
    expect(out.decisions[0].vetoed).toBe(true);
    expect(out.bees[0].position).toBeNull();
    expect(out.bees[0].realizedPnl).toBeLessThan(0); // closed below entry
  });

  it("ratchets the trail anchor for held bees and never un-tightens it", async () => {
    const deps: EngineDeps = { ask: async (batch) => batch.map(({ bee: bb, menu }) => fakeVerdict(bb.beeId, menu)) };
    const first = await runTick({
      bees: [bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 100, entryTs: NOW }) })],
      market: M, // last 100 -> equal to entry; anchor stays 100
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: NOW,
      deps,
    });
    expect(first.bees[0].position!.bestPrice).toBe(100);
    const second = await runTick({
      bees: [first.bees[0]],
      market: market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 105, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2 }) }),
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: NOW + 60_000,
      deps,
    });
    expect(second.bees[0].position!.bestPrice).toBe(105);
    const third = await runTick({
      bees: [second.bees[0]],
      market: market({ "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 104, todayOpen: 90, prevRange: 4, atrPct: 2, atr4hPct: 2 }) }),
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: NOW + 120_000,
      deps,
    });
    expect(third.bees[0].position!.bestPrice).toBe(105); // anchor never falls
  });

  it("keeps every held bee alive when a stop is not breached (no spurious fills)", async () => {
    const out = await runTick({
      bees: [
        bee({ beeId: "waggle", style: "breakout", position: pos({ entryPrice: 95, entryTs: NOW }) }),
        bee({ beeId: "hover", style: "trend", position: pos({ entryPrice: 95, entryTs: NOW }) }),
        bee({ beeId: "sting", style: "momentum", position: pos({ entryPrice: 95, entryTs: NOW }) }),
      ],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: NOW,
      deps: { ask: async (batch) => batch.map(({ bee: bb, menu }) => fakeVerdict(bb.beeId, menu)) },
    });
    // No stop fills: the only fills this tick may produce are Jev-driven adds.
    expect(out.fills.filter((f) => f.kind === "close")).toHaveLength(0);
    expect(out.decisions.every((d) => !d.finalAction.startsWith("STOP_"))).toBe(true);
  });
});
