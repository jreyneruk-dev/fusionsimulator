import { describe, expect, it } from "vitest";
import { breakoutMenu, momentumCandidates, momentumMenu, momentumScore, trendMenu } from "@/lib/strategies";
import { bee, cfg, market, snapshot } from "./helpers";
import type { MarketData } from "@/lib/types";

const M: MarketData = market({
  "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 95, prevRange: 4 }),
  "ETH-USDT-SWAP": snapshot({ instId: "ETH-USDT-SWAP", last: 50, todayOpen: 48, prevRange: 2, ensemble: 7 }),
  "DOGE-USDT-SWAP": snapshot({ instId: "DOGE-USDT-SWAP", last: 0.2, r7d: 0.9, r24: 0.2, volZ: 3 }),
  "PEPE-USDT-SWAP": snapshot({ instId: "PEPE-USDT-SWAP", last: 0.00001, r7d: 0.5, spreadBps: 58.6, vol24hUsd: 2_000_000 }),
});

describe("breakout (Waggle)", () => {
  it("offers a long only when price is above open + 0.5x yesterday range", () => {
    const b = bee({ beeId: "waggle", style: "breakout" });
    const menu = breakoutMenu(b, M, cfg());
    // BTC trigger = 95 + 2 = 97 < 100 -> offered; ETH trigger = 48 + 1 = 49 < 50 -> offered
    expect(menu.options.map((o) => o.action)).toEqual(["LONG_BTC-USDT-SWAP", "LONG_ETH-USDT-SWAP"]);
    expect(menu.forced).toBeNull(); // live rules: never forced in
  });
  it("offers no opens while positioned, only ride/cut", () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 90, entryTs: 0, leverage: 1 };
    const b = bee({ beeId: "waggle", style: "breakout", position: p });
    const menu = breakoutMenu(b, M, cfg());
    expect(menu.options.map((o) => o.action)).toEqual(["HOLD_WINNER", "CUT_LOSS"]);
  });
  it("shows WAIT when nothing is valid", () => {
    const flat = market({ "BTC-USDT-SWAP": snapshot({ todayOpen: 105, prevRange: 4 }) });
    const menu = breakoutMenu(bee({ beeId: "waggle", style: "breakout" }), flat, cfg());
    expect(menu.options[0].kind).toBe("wait");
  });
});

describe("trend (Hover)", () => {
  it("sizes opens by |ensemble|/9 and switches when positioned", () => {
    const b = bee({ beeId: "hover", style: "trend" });
    const menu = trendMenu(b, M, cfg());
    const eth = menu.options.find((o) => o.action === "LONG_ETH");
    expect(eth).toBeDefined();
    expect(eth!.sizeFrac).toBeCloseTo(7 / 9, 6);
  });
  it("forces a minimum-size entry toward the stronger score when flat", () => {
    const b = bee({ beeId: "hover", style: "trend" });
    const menu = trendMenu(b, M, cfg());
    expect(menu.forced).not.toBeNull();
    expect(menu.forced!.sizeFrac).toBe(0);
    expect(menu.forcedReason).toContain("never flat");
  });
});

describe("momentum (Sting)", () => {
  it("ranks on 7d momentum and excludes coins that fail the spread gate", () => {
    const cands = momentumCandidates(M, cfg());
    expect(cands.map((c) => c.instId)).not.toContain("PEPE-USDT-SWAP");
    expect(cands[0].instId).toBe("DOGE-USDT-SWAP");
  });
  it("offers APE options plus RIDE/BAIL while positioned", () => {
    const p = { instId: "ETH-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 50, entryTs: 0, leverage: 1 };
    const b = bee({ beeId: "sting", style: "momentum", position: p });
    const menu = momentumMenu(b, M, cfg());
    const actions = menu.options.map((o) => o.action);
    expect(actions).toContain("RIDE");
    expect(actions).toContain("BAIL");
    expect(actions.some((a) => a.startsWith("APE_"))).toBe(true);
    expect(actions).not.toContain("APE_ETH-USDT-SWAP");
  });
  it("forces an ape on the top candidate when flat (never flat > 1 tick)", () => {
    const menu = momentumMenu(bee({ beeId: "sting", style: "momentum" }), M, cfg());
    expect(menu.forced!.action).toBe("APE_DOGE-USDT-SWAP");
  });
  it("blends 7d, 24h and attention into the score", () => {
    const s = snapshot({ r7d: 1, r24: 0.1, volZ: 2 });
    expect(momentumScore(s)).toBeCloseTo(1 + 0.03 + 0.2, 9);
  });
});
