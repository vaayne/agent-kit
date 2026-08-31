import type { BbPluginApi } from "@get-bb/plugin-sdk";

export interface ModelPricing {
  /** USD per 1M fresh (non-cached) input tokens. */
  inputPerMTok: number;
  /** USD per 1M cached input tokens (cache-read price). */
  cachedInputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
}

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevModel {
  cost?: ModelsDevCost | null;
}

interface ModelsDevProvider {
  models?: Record<string, ModelsDevModel>;
}

const CATALOG_URL = "https://models.dev/api.json";
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Canonical models.dev provider per model-name family. Aggregators list the
 * same model id at resale prices; the canonical provider's number is the
 * vendor's own list price, so prefer it when present.
 */
const FAMILY_PROVIDERS: readonly { prefix: string; provider: string }[] = [
  { prefix: "claude", provider: "anthropic" },
  { prefix: "gpt", provider: "openai" },
  { prefix: "o1", provider: "openai" },
  { prefix: "o3", provider: "openai" },
  { prefix: "o4", provider: "openai" },
  { prefix: "glm", provider: "zai" },
  { prefix: "gemini", provider: "google" },
  { prefix: "deepseek", provider: "deepseek" },
  { prefix: "kimi", provider: "moonshotai" },
  { prefix: "qwen", provider: "qwen" },
];

function canonicalProviderFor(modelId: string): string | null {
  const lowered = modelId.toLowerCase();
  for (const { prefix, provider } of FAMILY_PROVIDERS) {
    if (lowered.startsWith(prefix)) return provider;
  }
  return null;
}

/**
 * Last-resort table for when models.dev is unreachable and nothing is
 * cached. Prices are order-of-magnitude placeholders, flagged as estimates
 * by the caller.
 */
const FALLBACK_PRICING: ModelPricing = {
  inputPerMTok: 1,
  cachedInputPerMTok: 0.1,
  outputPerMTok: 5,
};

/** "openai-codex/gpt-5.6-sol" or "cpa/gpt-5.6-terra@x" -> "gpt-5.6-sol". */
export function normalizeModelId(model: string): string {
  const withoutVendor = model.split("/").pop() ?? model;
  return (withoutVendor.split("@")[0] ?? withoutVendor).toLowerCase();
}

interface CatalogCache {
  providers: Record<string, ModelsDevProvider> | null;
  fetchedAt: number;
  /** In-flight fetch dedup. */
  pending: Promise<void> | null;
}

const cache: CatalogCache = { providers: null, fetchedAt: 0, pending: null };

async function fetchCatalog(bb: BbPluginApi): Promise<void> {
  try {
    const response = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as Record<string, ModelsDevProvider>;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("unexpected catalog shape");
    }
    cache.providers = body;
    cache.fetchedAt = Date.now();
  } catch (error) {
    // Keep any previous catalog; just record why the refresh failed.
    bb.log.warn(
      `models.dev refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    cache.pending = null;
  }
}

async function getCatalog(bb: BbPluginApi): Promise<Record<string, ModelsDevProvider> | null> {
  const fresh = cache.providers !== null && Date.now() - cache.fetchedAt < CATALOG_TTL_MS;
  if (fresh) return cache.providers;
  cache.pending ??= fetchCatalog(bb);
  await cache.pending;
  return cache.providers;
}

function costToPricing(cost: ModelsDevCost): ModelPricing | null {
  const input = cost.input;
  const output = cost.output;
  if (typeof input !== "number" || typeof output !== "number") return null;
  return {
    inputPerMTok: input,
    // Absent cache_read defaults to the input price (no discount).
    cachedInputPerMTok: typeof cost.cache_read === "number" ? cost.cache_read : input,
    outputPerMTok: output,
  };
}

/**
 * Resolve pricing from the models.dev catalog. Exact model-id match first
 * (canonical family provider preferred, then any provider carrying a
 * price); falls back to the longest model-id prefix.
 */
export async function lookupPricing(
  bb: BbPluginApi,
  model: string,
): Promise<ModelPricing | null> {
  const catalog = await getCatalog(bb);
  if (!catalog) return null;
  const modelId = normalizeModelId(model);
  if (!modelId) return null;

  const carriers: { provider: string; pricing: ModelPricing }[] = [];
  for (const [provider, entry] of Object.entries(catalog)) {
    const pricing = costToPricing(entry.models?.[modelId]?.cost ?? {});
    if (pricing) carriers.push({ provider, pricing });
  }
  if (carriers.length === 0) {
    // Prefix fallback: "claude-sonnet-4-5-20250929" -> "claude-sonnet-4-5".
    let best: { id: string; pricing: ModelPricing; provider: string } | null = null;
    for (const [provider, entry] of Object.entries(catalog)) {
      for (const id of Object.keys(entry.models ?? {})) {
        if (!modelId.startsWith(id) || id.length < 4) continue;
        const pricing = costToPricing(entry.models?.[id]?.cost ?? {});
        if (!pricing) continue;
        if (!best || id.length > best.id.length) best = { id, pricing, provider };
      }
    }
    return best?.pricing ?? null;
  }
  const canonical = canonicalProviderFor(modelId);
  return (
    carriers.find((carrier) => carrier.provider === canonical)?.pricing
      ?? carriers[0]!.pricing
  );
}

export function fallbackPricing(): ModelPricing {
  return FALLBACK_PRICING;
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
