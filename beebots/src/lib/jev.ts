/**
 * Jev (TypeSafe AI) client. One batched chat call covers all three bees:
 * state in, one action per bee out, with probabilities. Output tokens are free
 * on Jev ($0.042 / 1M input tokens); cost is metered for the daily cap.
 * The provider (AI Gateway / OpenAI-compatible / none) is resolved in
 * config.ts; this module only consumes cfg and holds no environment policy.
 */

import type { BeeAccount, JevVerdict, MarketData, MoveMenu } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import type { EngineDeps } from "@/lib/engine";
import { unrealisedPnl } from "@/lib/ledger";

const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/**
 * The compact numeric state Jev judges, built from data the engine already
 * holds. Lives here (not in strategies/) because its only consumer is the
 * prompt: it is presentation for the model, not trading logic.
 */
export function beeState(bee: BeeAccount, market: MarketData, menu: MoveMenu): Record<string, unknown> {
  const p = bee.position;
  const posSnap = p ? market.byInst[p.instId] : undefined;
  const atrPx = posSnap?.atrPct ? (posSnap.atrPct / 100) * p!.entryPrice : 0;
  const pnlUsd = p ? unrealisedPnl(bee, market) : 0;
  const f = (n: number | null | undefined, d = 2) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(d)));
  return {
    bee: { style: bee.style, startEquity: f(bee.startEquityUsd), realizedPnl: f(bee.realizedPnl), feesToday: f(bee.feesToday), tradesToday: bee.tradesToday },
    position: p
      ? { instId: p.instId, side: p.side, notional: f(p.notionalUsd), entry: p.entryPrice, mark: posSnap?.last ?? null, pnlUsd: f(pnlUsd), pnlR: atrPx ? f(pnlUsd / atrPx, 2) : null }
      : null,
    coins: Object.values(market.byInst)
      .filter((s) => menu.options.some((o) => o.instId === s.instId) || (p && s.instId === p.instId))
      .slice(0, 12)
      .map((s) => ({
        coin: s.instId.replace("-USDT-SWAP", ""),
        last: s.last,
        spreadBps: f(s.spreadBps, 1),
        r1h: s.r1 === null ? null : f(s.r1 * 100, 2),
        r24h: s.r24 === null ? null : f(s.r24 * 100, 2),
        r7d: s.r7d === null ? null : f(s.r7d * 100, 2),
        rsi: s.rsi === null ? null : f(s.rsi, 1),
        pctB: s.pctB === null ? null : f(s.pctB, 3),
        atrPct: s.atrPct === null ? null : f(s.atrPct, 2),
        ensemble: s.ensemble,
        funding: s.funding === null ? null : f(s.funding * 100, 4),
        fundingZ: s.fundingZ === null ? null : f(s.fundingZ, 2),
        oi1h: s.oiChange1h === null ? null : f(s.oiChange1h * 100, 2),
        volZ: s.volZ === null ? null : f(s.volZ, 2),
      })),
  };
}

function buildPrompt(batch: { bee: BeeAccount; menu: MoveMenu }[], market: MarketData) {
  const system =
    "You are Jev, a decision model. For each bee, choose exactly one action from its menu of valid moves and rate your conviction. " +
    "Respond ONLY with minified JSON: {\"decisions\":[{\"beeId\":string,\"action\":string,\"probabilities\":{action:number 0..1},\"conviction\":string}]}. " +
    "Probabilities must cover the bee's menu actions; conviction must be one of the bee's conviction scale labels.";
  const user = {
    asOf: new Date(market.ts).toISOString(),
    bees: batch.map(({ bee, menu }) => ({
      beeId: bee.beeId,
      style: bee.style,
      convictionScale: menu.convictionScale,
      actions: menu.options.map((o) => o.action),
      state: beeState(bee, market, menu),
    })),
  };
  return { system, user: JSON.stringify(user) };
}

function parseVerdicts(raw: string, batch: { bee: BeeAccount; menu: MoveMenu }[], provider: EngineConfig["jevProvider"]["kind"], inputTokens: number, latencyMs: number): JevVerdict[] {
  const parsed = JSON.parse(raw) as { decisions?: { beeId?: string; action?: string; probabilities?: Record<string, number>; conviction?: string }[] };
  const list = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  return batch.map(({ bee, menu }) => {
    const d = list.find((x) => x.beeId === bee.beeId) ?? {};
    const scale = menu.convictionScale;
    const cIdx = d.conviction ? scale.indexOf(d.conviction) : -1;
    return {
      beeId: bee.beeId,
      choice: d.action ?? "",
      probabilities: d.probabilities ?? {},
      conviction: cIdx >= 0 ? cIdx : 0,
      convictionScaleLabel: cIdx >= 0 ? scale[cIdx] : scale[0],
      provider,
      inputTokens,
      costUsd: inputTokens * JEV_USD_PER_INPUT_TOKEN,
      latencyMs,
    } as JevVerdict;
  });
}

/**
 * The engine's real Jev adapter (wired as EngineDeps.ask by the host).
 * One batched call for all bees. Throws on provider failure; the engine falls
 * back to null verdicts (code rides).
 */
export const askJev: EngineDeps["ask"] = async (batch, market, cfg) => {
  if (batch.length === 0) return [];
  const provider = cfg.jevProvider;
  if (provider.kind === "none") return batch.map(({ bee, menu }) => fakeVerdict(bee.beeId, menu, "none"));
  const { system, user } = buildPrompt(batch, market);
  const started = Date.now();
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(cfg.jevTimeoutMs),
    cache: "no-store",
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) throw new Error(`Jev provider HTTP ${res.status}`);
  const body = (await res.json()) as ChatResponse;
  if (body.error) throw new Error(`Jev provider error: ${body.error.message}`);
  const text = body.choices?.[0]?.message?.content ?? "";
  const inputTokens = body.usage?.prompt_tokens ?? Math.ceil(user.length / 4);
  return parseVerdicts(text, batch, provider.kind, inputTokens, latencyMs);
};

/** Deterministic fake used in tests and keyless runs (cost 0; records "fake" or "none"). */
export function fakeVerdict(beeId: string, menu: MoveMenu, provider: "fake" | "none" = "fake"): JevVerdict {
  const preferred =
    menu.options.find((o) => o.kind === "add") ??
    menu.options.find((o) => o.kind === "open" || o.kind === "switch") ??
    menu.options.find((o) => o.kind === "hold") ??
    menu.options[0];
  const probabilities: Record<string, number> = {};
  const n = Math.max(menu.options.length, 1);
  for (const o of menu.options) probabilities[o.action] = o.action === preferred.action ? 0.6 : 0.4 / Math.max(n - 1, 1);
  return {
    beeId,
    choice: preferred.action,
    probabilities,
    conviction: menu.convictionScale.length - 1, // top conviction so gates pass in tests
    convictionScaleLabel: menu.convictionScale[menu.convictionScale.length - 1],
    provider,
    inputTokens: 600,
    costUsd: 0,
    latencyMs: 1,
  };
}
