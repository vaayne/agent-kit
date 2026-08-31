import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * Per-million-token USD prices. Edit freely — costs are estimates for a
 * badge, not a bill. Model matching is a longest-prefix scan on lowercase
 * names, so "claude-opus-4-1" and vendor-prefixed ids both resolve.
 */
export interface ModelPricing {
  /** USD per 1M fresh (non-cached) input tokens. */
  inputPerMTok: number;
  /** USD per 1M cached input tokens (read price). */
  cachedInputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // Anthropic — Fable tier (flagship, e.g. claude-fable-5)
  "claude-fable": {
    inputPerMTok: 15,
    cachedInputPerMTok: 1.5,
    outputPerMTok: 75,
  },
  // Anthropic — Sonnet 4.5 / 4 class pricing
  "claude-sonnet-4": {
    inputPerMTok: 3,
    cachedInputPerMTok: 0.3,
    outputPerMTok: 15,
  },
  // Anthropic — Opus 4.1 / 4 class pricing
  "claude-opus-4": {
    inputPerMTok: 15,
    cachedInputPerMTok: 1.5,
    outputPerMTok: 75,
  },
  // Anthropic — Haiku 4.5 / 4 class pricing
  "claude-haiku-4": {
    inputPerMTok: 1,
    cachedInputPerMTok: 0.1,
    outputPerMTok: 5,
  },
  // OpenAI GPT-5.5 family
  "gpt-5.5": { inputPerMTok: 1.25, cachedInputPerMTok: 0.125, outputPerMTok: 10 },
  "gpt-5.6": { inputPerMTok: 1.25, cachedInputPerMTok: 0.125, outputPerMTok: 10 },
  "gpt-5": { inputPerMTok: 1.25, cachedInputPerMTok: 0.125, outputPerMTok: 10 },
  // GLM
  "glm-5": { inputPerMTok: 0.6, cachedInputPerMTok: 0.11, outputPerMTok: 2.2 },
  "glm-4": { inputPerMTok: 0.6, cachedInputPerMTok: 0.11, outputPerMTok: 2.2 },
  // Fallback when a model cannot be matched; flagged to the user.
  default: { inputPerMTok: 1, cachedInputPerMTok: 0.1, outputPerMTok: 5 },
};

const SORTED_PREFIXES = Object.keys(PRICING_TABLE)
  .filter((key) => key !== "default")
  .sort((a, b) => b.length - a.length);

export function parseModelPricing(model: string): ModelPricing | null {
  const lowered = model.toLowerCase();
  for (const prefix of SORTED_PREFIXES) {
    if (lowered.includes(prefix)) return PRICING_TABLE[prefix]!;
  }
  if (lowered.includes("default")) return PRICING_TABLE.default!;
  return null;
}

export function estimateCostUsd(
  pricing: ModelPricing,
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  },
): number {
  const cost = (usage.inputTokens / 1_000_000) * pricing.inputPerMTok
    + (usage.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMTok
    + (usage.outputTokens / 1_000_000) * pricing.outputPerMTok;
  // Round to a tenth of a cent — the badge shows at most 4 decimals.
  return Math.round(cost * 100_000) / 100_000;
}
