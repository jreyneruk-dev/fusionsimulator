/**
 * Jev (TypeSafe AI) client. One batched chat call covers all three bees:
 * state in, one action per bee out, with probabilities. Output tokens are free
 * on Jev ($0.042 / 1M input tokens); cost is metered for the daily cap.
 *
 * Providers:
 *  - Vercel AI Gateway (default): https://ai-gateway.vercel.sh/v1, model
 *    "typesafe-ai/jev". On Vercel the key is injected as AI_GATEWAY_API_KEY.
 *  - Any OpenAI-compatible endpoint (OpenRouter hosts typesafe/jev-1.13).
 * If no provider is configured, the engine runs with null verdicts: code rides
 * all positions and nothing opens — the loop stays verifiable at zero cost.
 */

import type { JevVerdict, MarketData, MoveMenu } from "@/lib/types";
import type { EngineConfig } from "@/lib/config";
import { beeState } from "@/lib/strategies";
import type { BeeAccount } from "@/lib/types";

const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";
const JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

export type JevProviderKind = "ai-gateway" | "openai-compat" | "fake" | "none";

export function resolveProvider(cfg: EngineConfig): { kind: JevProviderKind; base: string; key: string; model: string } {
  const gw = process.env.AI_GATEWAY_API_KEY;
  if (gw) return { kind: "ai-gateway", base: GATEWAY_BASE, key: gw, model: cfg.jevModel };
  const base = process.env.OPENAI_COMPAT_BASE_URL;
  const key = process.env.OPENAI_COMPAT_API_KEY;
  if (base && key) return { kind: "openai-compat", base: base.replace(/\/$/, ""), key, model: process.env.OPENAI_COMPAT_MODEL || cfg.jevModel };
  return { kind: "none", base: "", key: "", model: cfg.jevModel };
}

export interface JevRequest {
  bee: BeeAccount;
  menu: MoveMenu;
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

function buildPrompt(batch: JevRequest[], market: MarketData) {
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

function parseVerdicts(raw: string, batch: JevRequest[], provider: JevProviderKind, inputTokens: number, latencyMs: number, cfg: EngineConfig): JevVerdict[] {
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
      costUsd: provider === "fake" ? 0 : inputTokens * JEV_USD_PER_INPUT_TOKEN,
      latencyMs,
    } as JevVerdict;
  });
}

/** One batched call for all bees. Throws on provider failure; callers fall back to null verdicts. */
export async function askJev(batch: JevRequest[], market: MarketData, cfg: EngineConfig): Promise<JevVerdict[]> {
  if (batch.length === 0) return [];
  const provider = resolveProvider(cfg);
  if (provider.kind === "none") return batch.map(({ bee, menu }) => fakeVerdict(bee.beeId, menu, "none"));
  const { system, user } = buildPrompt(batch, market);
  const started = Date.now();
  const res = await fetch(`${provider.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.key}` },
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
  return parseVerdicts(text, batch, provider.kind, inputTokens, latencyMs, cfg);
}

/** Deterministic fake used in tests and keyless runs (cost 0, provider "fake"/"none"). */
export function fakeVerdict(beeId: string, menu: MoveMenu, provider: JevProviderKind = "fake"): JevVerdict {
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
