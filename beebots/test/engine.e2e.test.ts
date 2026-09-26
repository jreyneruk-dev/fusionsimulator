/**
 * End-to-end tick on paper with a fake Jev: the whole engine loop, no network,
 * no spend. Mirrors the spirit of his `pnpm e2e:fake-jev`.
 */

import { describe, expect, it } from "vitest";
import { runTick } from "@/lib/engine";
import type { EngineDeps } from "@/lib/engine";
import { fakeVerdict } from "@/lib/jev";
import { bee, cfg, market, snapshot } from "./helpers";

const M = market({
  "BTC-USDT-SWAP": snapshot({ instId: "BTC-USDT-SWAP", last: 100, todayOpen: 95, prevRange: 4 }),
  "ETH-USDT-SWAP": snapshot({ instId: "ETH-USDT-SWAP", last: 50, ensemble: 7 }),
  "DOGE-USDT-SWAP": snapshot({ instId: "DOGE-USDT-SWAP", last: 0.2, r7d: 0.9 }),
});

const fakeDeps = (): EngineDeps => ({
  ask: async (batch) => batch.map(({ bee: b, menu }) => fakeVerdict(b.beeId, menu)),
});

describe("runTick (fake Jev, paper)", () => {
  it("takes decisions, opens positions, pays fees and counts trades", async () => {
    const now = Date.UTC(2026, 8, 26, 12, 0, 0);
    const out = await runTick({
      bees: [
        bee({ beeId: "waggle", style: "breakout" }),
        bee({ beeId: "hover", style: "trend" }),
        bee({ beeId: "sting", style: "momentum" }),
      ],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now,
      deps: fakeDeps(),
    });
    expect(out.decisions).toHaveLength(3);
    expect(out.decisions.every((d) => d.verdict !== null)).toBe(true);
    // Breakout: trigger 97 < 100, sizeFrac 1 -> opens BTC at full clamped size
    const waggle = out.bees.find((b) => b.beeId === "waggle")!;
    expect(waggle.position).not.toBeNull();
    expect(waggle.position!.instId).toBe("BTC-USDT-SWAP");
    expect(waggle.tradesToday).toBe(1);
    expect(waggle.feesPaid).toBeGreaterThan(0);
    // Trend: flat + Jev top conviction -> opens (menu open at ensemble size)
    const hover = out.bees.find((b) => b.beeId === "hover")!;
    expect(hover.position).not.toBeNull();
    // Momentum: forces an ape on the top candidate (DOGE)
    const sting = out.bees.find((b) => b.beeId === "sting")!;
    expect(sting.position!.instId).toBe("DOGE-USDT-SWAP");
    expect(out.fills).toHaveLength(3);
    expect(out.jevCostUsd).toBe(0); // fake provider costs nothing
    expect(out.provider).toBe("none"); // keyless cfg: the provider kind is recorded
  });

  it("shuts the bee out of thin coins: the menu is WAIT and nothing fills", async () => {
    const thin = market({
      // His 2026-09-24 real case: RAY sat at 58.6bp spread and failed the gate.
      "RAY-USDT-SWAP": snapshot({ instId: "RAY-USDT-SWAP", last: 5, spreadBps: 58.6, r7d: 2 }),
    });
    const out = await runTick({
      bees: [bee({ beeId: "sting", style: "momentum" })],
      market: thin,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: Date.UTC(2026, 8, 26, 12, 0, 0),
      deps: fakeDeps(),
    });
    // The gate applies at ranking level: RAY never becomes a candidate,
    // so the menu is WAIT and the bee simply sits out the tick.
    expect(out.decisions[0].finalAction).toBe("WAIT");
    expect(out.fills).toHaveLength(0);
    const sting = out.bees[0];
    expect(sting.position).toBeNull();
    expect(sting.feesPaid).toBe(0);
  });

  it("skips Jev entirely once the daily cap is spent", async () => {
    let asked = 0;
    const out = await runTick({
      bees: [bee({ beeId: "sting", style: "momentum" })],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 1, // cap is 0.20
      now: Date.UTC(2026, 8, 26, 12, 0, 0),
      deps: {
        ask: async (batch) => {
          asked += batch.length;
          return batch.map(({ bee: b, menu }) => fakeVerdict(b.beeId, menu));
        },
      },
    });
    expect(asked).toBe(0);
    expect(out.jevCapped).toBe(true);
    expect(out.decisions[0].verdict).toBeNull();
  });

  it("benched bees never reach Jev but keep riding", async () => {
    const p = { instId: "BTC-USDT-SWAP", side: "long" as const, notionalUsd: 200, entryPrice: 95, entryTs: Date.UTC(2026, 8, 26, 6), leverage: 1 };
    let asked = 0;
    const out = await runTick({
      bees: [bee({ beeId: "sting", style: "momentum", position: p, tradesToday: 3 })],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: Date.UTC(2026, 8, 26, 12, 0, 0),
      deps: {
        ask: async (batch) => {
          asked += batch.length;
          return batch.map(({ bee: b, menu }) => fakeVerdict(b.beeId, menu));
        },
      },
    });
    expect(asked).toBe(0);
    expect(out.bees[0].position).not.toBeNull();
    // DRAMA_RULES: "Jev is not asked" for benched bees, so no decision is recorded.
    expect(out.decisions).toHaveLength(0);
  });

  it("rolls the daily counters at UTC midnight", async () => {
    const out = await runTick({
      bees: [bee({ beeId: "sting", style: "momentum", tradesToday: 3, feesToday: 2, dayKey: "2026-09-25" })],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: Date.UTC(2026, 8, 26, 0, 0, 1),
      deps: fakeDeps(),
    });
    expect(out.bees[0].tradesToday).toBe(1); // reset to 0, then the forced ape counts
    expect(out.bees[0].feesToday).toBeLessThan(1);
    expect(out.bees[0].dayStartEquityUsd).toBeCloseTo(333, 4);
  });

  it("on a Jev outage, records null verdicts and falls back to code-forced entries", async () => {
    const out = await runTick({
      bees: [bee({ beeId: "sting", style: "momentum" })],
      market: M,
      cfg: cfg(),
      jevUsedTodayUsd: 0,
      now: Date.UTC(2026, 8, 26, 12, 0, 0),
      deps: { ask: async () => { throw new Error("provider down"); } },
    });
    expect(out.decisions[0].verdict).toBeNull();
    expect(out.notes.join(" ")).toContain("Jev unavailable");
    // DRAMA_RULES: only caps/fee budget/loss stop suspend forcing — a plain
    // outage leaves the never-flat rules in force, so the forced ape still fires
    // (an allowed forced entry is not a veto, so there is no vetoReason).
    expect(out.decisions[0].vetoed).toBe(false);
    expect(out.decisions[0].finalAction).toBe("APE_DOGE-USDT-SWAP");
    expect(out.fills).toHaveLength(1);
    expect(out.bees[0].position!.instId).toBe("DOGE-USDT-SWAP");
  });
});
