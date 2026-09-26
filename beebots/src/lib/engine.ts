/**
 * The tick: the loop body, pure and dependency-injected.
 * Order mirrors his engine: look -> summarise -> ask Jev -> check (risk) ->
 * record (decision) -> act (paper fills). Decisions are returned for the caller
 * to persist BEFORE applying actions, in case the DB write fails.
 */

import type { BeeAccount, Decision, FinalAction, Fill, JevVerdict, MarketData, MoveMenu } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { buildMenu, CONVICTION_SCALES } from "@/lib/strategies";
import { applyRisk, capsFor, dayKeyOf, equityOf } from "@/lib/risk";
import { askJev, resolveProvider } from "@/lib/jev";
import { addToPosition, closePosition, fundingDueUsd, openPosition } from "@/lib/ledger";

export interface EngineDeps {
  ask: (batch: { bee: BeeAccount; menu: MoveMenu }[], market: MarketData) => Promise<JevVerdict[]>;
}

export const defaultDeps: EngineDeps = {
  ask: (batch, market) => askJev(batch, market, loadConfigShim()),
};

// Avoids a circular import at module init; config is cheap to build.
import { loadConfig } from "@/lib/config";
function loadConfigShim() {
  return loadConfig();
}

export interface TickInput {
  bees: BeeAccount[];
  market: MarketData;
  cfg: EngineConfig;
  /** Jev spend already used today (USD), across all bees */
  jevUsedTodayUsd: number;
  now?: number;
  deps?: EngineDeps;
}

export interface TickOutput {
  decisions: Decision[];
  fills: Fill[];
  bees: BeeAccount[];
  jevCostUsd: number;
  jevCapped: boolean;
  provider: string;
  notes: string[];
}

function rolloverDay(bee: BeeAccount, equityNow: number, now: number): BeeAccount {
  const key = dayKeyOf(now);
  if (bee.dayKey === key) return bee;
  return { ...bee, dayKey: key, tradesToday: 0, feesToday: 0, dayStartEquityUsd: equityNow };
}

export async function runTick(input: TickInput): Promise<TickOutput> {
  const { bees, market, cfg } = input;
  const now = input.now ?? Date.now();
  const deps = input.deps ?? defaultDeps;
  const notes: string[] = [];

  // 1. Daily counters roll over at 00:00 UTC; funding accrues at each boundary.
  const rolled = bees.map((b) => rolloverDay(b, equityOf(b, market), now));

  // 2. Funding for open positions, accrued incrementally since the last accrual.
  const withFunding = rolled.map((b) => {
    if (!b.position) return b;
    const s = market.byInst[b.position.instId];
    if (!s || s.funding === null || s.funding === 0) return b;
    const since = b.lastFundingTs ?? b.position.entryTs;
    const due = fundingDueUsd(b.position, s.funding, since, now);
    if (Math.abs(due) < 0.000001) return b;
    return { ...b, fundingPaid: b.fundingPaid + due, lastFundingTs: now };
  });

  // 3. Benched / retired / paused bees never see Jev; code rides their positions.
  const active = withFunding.filter((b) => {
    if (b.paused) return false;
    const caps = capsFor(b, cfg, equityOf(b, market), now);
    if (caps.retired) {
      notes.push(`${b.name}: retired (equity below ${(100 - (100 - cfg.retireAtPct)).toFixed(0)}% floor)`);
      return false;
    }
    if (caps.benched) {
      notes.push(`${b.name}: benched (cap or fee budget tripped) — code rides`);
      return false;
    }
    return true;
  });

  // 4. Build menus for active bees; Jev outage -> null verdicts (code rides).
  const batch = active.map((bee) => ({ bee, menu: buildMenu(bee, market, cfg) }));
  const provider = resolveProvider(cfg);
  let verdicts: (JevVerdict | null)[] = active.map(() => null);
  let jevCost = 0;
  let jevCapped = false;

  if (batch.length) {
    if (input.jevUsedTodayUsd >= cfg.jevDailyUsdCap) {
      jevCapped = true;
      notes.push(`Jev daily cap hit ($${cfg.jevDailyUsdCap.toFixed(2)}) — all bees hold until 00:00 UTC`);
    } else {
      try {
        const vs = await deps.ask(batch, market);
        verdicts = vs;
        jevCost = vs.reduce((a, v) => a + v.costUsd, 0);
      } catch (err) {
        notes.push(`Jev unavailable (${err instanceof Error ? err.message : String(err)}) — code takes over this tick`);
      }
    }
  }

  // 5. Risk layer per bee: record the decision, then act.
  const decisions: Decision[] = [];
  const fills: Fill[] = [];
  const finalBees = new Map<string, BeeAccount>(withFunding.map((b) => [b.beeId, b]));

  for (let i = 0; i < active.length; i++) {
    const bee = active[i];
    const menu = batch[i].menu;
    const verdict = verdicts[i] ?? null;
    const final: FinalAction = applyRisk(bee, menu, verdict, market, cfg, now);

    decisions.push({
      beeId: bee.beeId,
      ts: now,
      menu,
      verdict,
      finalAction: final.action,
      finalInstId: final.instId,
      finalSide: final.side,
      sizeUsd: final.sizeUsd,
      vetoed: final.vetoed,
      vetoReason: final.vetoReason,
    });

    let b = finalBees.get(bee.beeId)!;
    try {
      if (final.kind === "close" && b.position && final.instId === b.position.instId) {
        const portion = final.action === "TRIM_HALF" ? 0.5 : 1;
        const res = closePosition(b, portion, market, now);
        b = res.bee;
        fills.push(res.fill);
      } else if ((final.kind === "open" || final.kind === "switch" || final.kind === "flip") && final.instId && final.sizeUsd >= 1) {
        if (b.position) {
          if (b.position.instId !== final.instId) {
            // Switch: close the old leg, then open the new.
            const closed = closePosition(b, 1, market, now, "flip");
            b = closed.bee;
            fills.push(closed.fill);
          } else {
            // Same coin: treat as an add within the clamped size.
            const res = addToPosition(b, final.sizeUsd, market, now);
            b = res.bee;
            fills.push(res.fill);
            finalBees.set(b.beeId, b);
            continue;
          }
        }
        const res = openPosition(b, final.instId, final.side ?? "long", final.sizeUsd, market, now);
        b = res.bee;
        fills.push(res.fill);
        b = { ...b, tradesToday: b.tradesToday + 1 };
      } else if (final.kind === "add" && b.position && final.sizeUsd >= 1) {
        const res = addToPosition(b, final.sizeUsd, market, now);
        b = res.bee;
        fills.push(res.fill);
      }
    } catch (err) {
      notes.push(`${bee.name}: action failed (${err instanceof Error ? err.message : String(err)})`);
    }
    finalBees.set(b.beeId, b);
  }

  return {
    decisions,
    fills,
    bees: rolled.map((b) => finalBees.get(b.beeId) ?? b),
    jevCostUsd: jevCost,
    jevCapped,
    provider: provider.kind,
    notes,
  };
}

/** Conviction scale lookup exposed for the dashboard. */
export function convictionScaleFor(style: string): string[] {
  return CONVICTION_SCALES[style] ?? [];
}
