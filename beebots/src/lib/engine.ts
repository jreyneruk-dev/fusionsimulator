/**
 * The tick: the loop body, pure and dependency-injected.
 * Order mirrors his engine: look -> summarise -> ask Jev -> check (risk) ->
 * record (decision) -> act (paper fills). Decisions are returned for the caller
 * to persist BEFORE applying actions, in case the DB write fails.
 */

import type { BeeAccount, Decision, FinalAction, Fill, JevVerdict, MarketData, MoveMenu } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { buildMenu } from "@/lib/strategies";
import { applyRisk, capsFor, dayKeyOf } from "@/lib/risk";
import { evaluateStops } from "@/lib/stops";
import { equityOf } from "@/lib/ledger";
import { addToPosition, closePosition, fundingDueUsd, openPosition } from "@/lib/ledger";

/**
 * The one seam between the pure tick and the world: the decision model.
 * The host (prod/tick.ts) wires the real client; tests wire a fake. There is
 * deliberately no default — a tick must say where its decisions come from.
 */
export interface EngineDeps {
  ask: (batch: { bee: BeeAccount; menu: MoveMenu }[], market: MarketData, cfg: EngineConfig) => Promise<JevVerdict[]>;
}

export interface TickInput {
  bees: BeeAccount[];
  market: MarketData;
  cfg: EngineConfig;
  /** Jev spend already used today (USD), across all bees */
  jevUsedTodayUsd: number;
  now?: number;
  deps: EngineDeps;
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
  const { bees, market, cfg, deps } = input;
  const now = input.now ?? Date.now();
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

  // 3. Code stops run for EVERY held bee — benched, retired and paused included
  // (DRAMA_RULES §2: only code can close a position while the bee is benched).
  // Forced closes take the same paper-ledger path as any other fill.
  const decisions: Decision[] = [];
  const fills: Fill[] = [];
  const postStop = new Map<string, BeeAccount>(withFunding.map((b) => [b.beeId, b]));
  for (const b of withFunding) {
    if (!b.position) continue;
    const stop = evaluateStops(b, market, cfg, now);
    if (stop) {
      const pos = b.position;
      const res = closePosition(b, 1, market, now);
      fills.push(res.fill);
      postStop.set(res.bee.beeId, res.bee);
      decisions.push({
        beeId: b.beeId,
        ts: now,
        style: b.style,
        verdict: null,
        finalAction: `STOP_${stop.reason.toUpperCase()}`,
        finalInstId: pos.instId,
        finalSide: pos.side,
        sizeUsd: res.fill.notionalUsd,
        vetoed: true,
        vetoReason: stop.detail,
      });
      notes.push(`${b.name}: STOP_${stop.reason.toUpperCase()} — ${stop.detail}`);
    } else {
      // Ratchet the trailing-stop anchor for every held bee (stops only tighten).
      const s = market.byInst[b.position.instId];
      if (s) {
        const anchor = b.position.bestPrice ?? b.position.entryPrice;
        const best = b.position.side === "long" ? Math.max(anchor, s.last) : Math.min(anchor, s.last);
        postStop.set(b.beeId, { ...b, position: { ...b.position, bestPrice: best } });
      }
    }
  }

  // 4. Benched / retired / paused bees never see Jev; code rides their positions.
  const active = [...postStop.values()].filter((b) => {
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
  const providerKind = cfg.jevProvider.kind;
  let verdicts: (JevVerdict | null)[] = active.map(() => null);
  let jevCost = 0;
  let jevCapped = false;

  if (batch.length) {
    if (input.jevUsedTodayUsd >= cfg.jevDailyUsdCap) {
      jevCapped = true;
      notes.push(`Jev daily cap hit ($${cfg.jevDailyUsdCap.toFixed(2)}) — all bees hold until 00:00 UTC`);
    } else {
      try {
        const vs = await deps.ask(batch, market, cfg);
        verdicts = vs;
        jevCost = vs.reduce((a, v) => a + v.costUsd, 0);
      } catch (err) {
        notes.push(`Jev unavailable (${err instanceof Error ? err.message : String(err)}) — code takes over this tick`);
      }
    }
  }

  // 5. Risk layer per bee: record the decision, then act.
  const finalBees = new Map<string, BeeAccount>([...postStop.values()].map((b) => [b.beeId, b]));

  for (let i = 0; i < active.length; i++) {
    const bee = active[i];
    const menu = batch[i].menu;
    const verdict = verdicts[i] ?? null;

    const final: FinalAction = applyRisk(bee, menu, verdict, market, cfg, now);

    decisions.push({
      beeId: bee.beeId,
      ts: now,
      style: bee.style,
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
    provider: providerKind,
    notes,
  };
}
