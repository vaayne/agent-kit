import { type ExtensionAPI, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Registers the `cpa` provider from its OpenAI-compatible `/v1/models` endpoint.
 *
 * CPA determines which model IDs are available. models.dev provides their canonical
 * metadata because CPA's model endpoint only reliably exposes IDs.
 *
 * Credentials come from the `cpa` entry in `~/.pi/agent/auth.json`, with the
 * gateway URL in the credential's provider-scoped `env`:
 *
 *   { "cpa": { "type": "api_key", "key": "sk-...", "env": { "CPA_BASE_URL": "https://..." } } }
 */

const PROVIDER = "cpa";
const BASE_URL_KEY = "CPA_BASE_URL";
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_MODELS_URL = "https://models.dev/models.json";
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const MODEL_CACHE_PATH = join(homedir(), ".cache", "pi", "cpa-models-v3.json");

type ModelCost = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  tiers?: Array<{
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    inputTokensAbove: number;
  }>;
};

type ProviderModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
};

type ModelCache = {
  baseUrl: string;
  fetchedAt: number;
  models: ProviderModelConfig[];
};

type GatewayModel = {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  reasoning?: unknown;
  input?: unknown;
  cost?: unknown;
  context_window?: unknown;
  contextWindow?: unknown;
  max_tokens?: unknown;
  maxTokens?: unknown;
};

type ModelsResponse = { data?: GatewayModel[] };

type ModelsDevModel = {
  id?: unknown;
  name?: unknown;
  reasoning?: unknown;
  modalities?: { input?: unknown };
  limit?: { context?: unknown; output?: unknown };
  cost?: {
    input?: unknown;
    output?: unknown;
    cache_read?: unknown;
    cache_write?: unknown;
    tiers?: Array<{
      input?: unknown;
      output?: unknown;
      cache_read?: unknown;
      cache_write?: unknown;
      tier?: { type?: unknown; size?: unknown };
    }>;
  };
};

type ModelsDevApi = Record<string, { models?: Record<string, ModelsDevModel> }>;
type ModelsDevModels = Record<string, ModelsDevModel>;

type ModelsDevCatalog = {
  api: ModelsDevApi;
  models: ModelsDevModels;
};

type ModelsDevMatch = {
  model: ModelsDevModel;
};

const PROVIDER_BY_MODEL_PREFIX: Array<[RegExp, string[]]> = [
  [/^claude-/, ["anthropic"]],
  [/^(gpt-|o[1-9])/, ["openai"]],
  [/^gemini-/, ["google"]],
  [/^grok-/, ["xai"]],
  [/^deepseek-/, ["deepseek"]],
  [/^(kimi-|moonshotai\/)/, ["moonshotai"]],
  [/^qwen/, ["alibaba", "alibaba-cn"]],
];

function isModelCost(value: unknown): value is ModelCost {
  if (typeof value !== "object" || value === null) return false;
  const cost = value as ModelCost;
  return (
    typeof cost.input === "number"
    && typeof cost.output === "number"
    && typeof cost.cacheRead === "number"
    && typeof cost.cacheWrite === "number"
    && (cost.tiers === undefined
      || (Array.isArray(cost.tiers)
        && cost.tiers.every((tier) => (
          typeof tier.input === "number"
          && typeof tier.output === "number"
          && typeof tier.cacheRead === "number"
          && typeof tier.cacheWrite === "number"
          && typeof tier.inputTokensAbove === "number"
        ))))
  );
}

function isProviderModelConfig(value: unknown): value is ProviderModelConfig {
  if (typeof value !== "object" || value === null) return false;
  const model = value as ProviderModelConfig;
  return (
    typeof model.id === "string"
    && typeof model.name === "string"
    && typeof model.reasoning === "boolean"
    && Array.isArray(model.input)
    && model.input.every((entry) => entry === "text" || entry === "image")
    && isModelCost(model.cost)
    && typeof model.contextWindow === "number"
    && typeof model.maxTokens === "number"
  );
}

function isModelCache(value: unknown): value is ModelCache {
  if (typeof value !== "object" || value === null) return false;
  const cache = value as ModelCache;
  return (
    typeof cache.baseUrl === "string"
    && typeof cache.fetchedAt === "number"
    && Array.isArray(cache.models)
    && cache.models.every(isProviderModelConfig)
  );
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toGatewayModelName(model: GatewayModel & { id: string }): string {
  if (typeof model.name === "string") return model.name;
  if (typeof model.display_name === "string") return model.display_name;
  return model.id.split("/").at(-1) ?? model.id;
}

function toGatewayModelConfig(model: GatewayModel): ProviderModelConfig | undefined {
  if (typeof model.id !== "string") return undefined;

  const cost = model.cost as {
    input?: unknown;
    output?: unknown;
    cacheRead?: unknown;
    cacheWrite?: unknown;
  } | undefined;

  return {
    id: model.id,
    name: toGatewayModelName({ ...model, id: model.id }),
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : true,
    input: Array.isArray(model.input) && model.input.every((entry) => entry === "text" || entry === "image")
      ? model.input
      : ["text", "image"],
    cost: {
      input: numberOr(cost?.input, 0),
      output: numberOr(cost?.output, 0),
      cacheRead: numberOr(cost?.cacheRead, 0),
      cacheWrite: numberOr(cost?.cacheWrite, 0),
    },
    contextWindow: numberOr(model.contextWindow ?? model.context_window, 262144),
    maxTokens: numberOr(model.maxTokens ?? model.max_tokens, 262144),
  };
}

function normalizeModelId(id: string): string {
  return id.split("/").at(-1)?.toLowerCase().replaceAll("_", "-") ?? id.toLowerCase();
}

function canonicalModelId(id: string): string {
  const normalized = normalizeModelId(id).replace(/-fp(?:8|16)$/, "");
  return normalized.replace(/^gemini-(.+)-(?:high|medium|low)$/, "gemini-$1");
}

function preferredProviders(modelId: string): string[] {
  return PROVIDER_BY_MODEL_PREFIX.find(([prefix]) => prefix.test(modelId))?.[1] ?? [];
}

function findModelsDevMatch(catalog: ModelsDevCatalog, gatewayModelId: string): ModelsDevMatch | undefined {
  const id = canonicalModelId(gatewayModelId);
  const preferred = preferredProviders(gatewayModelId.toLowerCase());

  for (const provider of preferred) {
    const models = catalog.api[provider]?.models ?? {};
    for (const [key, model] of Object.entries(models)) {
      const modelId = typeof model.id === "string" ? model.id : key;
      if (canonicalModelId(modelId) === id) return { model };
    }
  }

  // A provider-neutral entry is safer than arbitrary reseller metadata.
  for (const [key, model] of Object.entries(catalog.models)) {
    const modelId = typeof model.id === "string" ? model.id : key;
    if (canonicalModelId(modelId) === id) return { model };
  }
}

function toModelsDevCost(cost: ModelsDevModel["cost"], fallback: ModelCost): ModelCost {
  if (cost === undefined) return fallback;

  const tiers = (cost.tiers ?? []).flatMap((tier) => {
    if (tier.tier?.type !== "context" || typeof tier.tier.size !== "number") return [];
    return [{
      input: numberOr(tier.input, fallback.input),
      output: numberOr(tier.output, fallback.output),
      cacheRead: numberOr(tier.cache_read, fallback.cacheRead),
      cacheWrite: numberOr(tier.cache_write, fallback.cacheWrite),
      inputTokensAbove: tier.tier.size,
    }];
  });

  return {
    input: numberOr(cost.input, fallback.input),
    output: numberOr(cost.output, fallback.output),
    cacheRead: numberOr(cost.cache_read, fallback.cacheRead),
    cacheWrite: numberOr(cost.cache_write, fallback.cacheWrite),
    ...(tiers.length > 0 ? { tiers } : {}),
  };
}

function enrichModel(gatewayModel: GatewayModel, catalog: ModelsDevCatalog): ProviderModelConfig | undefined {
  const fallback = toGatewayModelConfig(gatewayModel);
  if (fallback === undefined) return undefined;

  const match = findModelsDevMatch(catalog, fallback.id);
  if (match === undefined) return fallback;

  const { model } = match;
  const modalities = model.modalities?.input;
  const supportsImage = Array.isArray(modalities) && modalities.includes("image");

  return {
    id: fallback.id,
    name: typeof model.name === "string" ? model.name : fallback.name,
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : fallback.reasoning,
    input: supportsImage ? ["text", "image"] : ["text"],
    cost: toModelsDevCost(model.cost, fallback.cost),
    contextWindow: numberOr(model.limit?.context, fallback.contextWindow),
    maxTokens: numberOr(model.limit?.output, fallback.maxTokens),
  };
}

async function readModelCache(): Promise<ModelCache | undefined> {
  try {
    const cache = JSON.parse(await readFile(MODEL_CACHE_PATH, "utf8")) as unknown;
    return isModelCache(cache) ? cache : undefined;
  } catch {
    return undefined;
  }
}

async function writeModelCache(baseUrl: string, models: ProviderModelConfig[]): Promise<void> {
  await mkdir(dirname(MODEL_CACHE_PATH), { recursive: true });
  await writeFile(MODEL_CACHE_PATH, JSON.stringify({ baseUrl, fetchedAt: Date.now(), models }, null, 2));
}

async function fetchGatewayModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<GatewayModel[]> {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${PROVIDER} models: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as ModelsResponse;
  return body.data ?? [];
}

async function fetchModelsDevCatalog(signal?: AbortSignal): Promise<ModelsDevCatalog> {
  const [apiResponse, modelsResponse] = await Promise.all([
    fetch(MODELS_DEV_API_URL, { signal }),
    fetch(MODELS_DEV_MODELS_URL, { signal }),
  ]);
  if (!apiResponse.ok || !modelsResponse.ok) {
    throw new Error(
      `Failed to fetch models.dev catalog: api=${apiResponse.status}, models=${modelsResponse.status}`,
    );
  }
  return {
    api: (await apiResponse.json()) as ModelsDevApi,
    models: (await modelsResponse.json()) as ModelsDevModels,
  };
}

async function fetchModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<ProviderModelConfig[]> {
  const [gatewayResult, catalogResult] = await Promise.allSettled([
    fetchGatewayModels(baseUrl, apiKey, signal),
    fetchModelsDevCatalog(signal),
  ]);
  if (gatewayResult.status === "rejected") throw gatewayResult.reason;

  const gatewayModels = gatewayResult.value;
  if (catalogResult.status === "fulfilled") {
    return gatewayModels
      .map((model) => enrichModel(model, catalogResult.value))
      .filter((model) => model !== undefined);
  }

  // models.dev is metadata only. CPA availability must remain usable during an outage.
  return gatewayModels.map(toGatewayModelConfig).filter((model) => model !== undefined);
}

async function getModels(
  baseUrl: string,
  apiKey: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ProviderModelConfig[]> {
  const cache = await readModelCache();
  const matchingCache = cache?.baseUrl === baseUrl ? cache : undefined;
  if (!options.force && matchingCache && Date.now() - matchingCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return matchingCache.models;
  }

  try {
    const models = await fetchModels(baseUrl, apiKey, options.signal);
    await writeModelCache(baseUrl, models);
    return models;
  } catch (error) {
    if (matchingCache) return matchingCache.models;
    throw error;
  }
}

export default async function cpaProvider(pi: ExtensionAPI) {
  const credential = readStoredCredential(PROVIDER);
  if (credential?.type !== "api_key" || !credential.key) return;

  const apiKey = credential.key;
  const baseUrl = credential.env?.[BASE_URL_KEY];
  if (!baseUrl) return;

  let models = await getModels(baseUrl, apiKey);

  // No apiKey here: the stored credential outranks provider config in pi's auth composer.
  pi.registerProvider(PROVIDER, {
    baseUrl,
    api: "openai-responses",
    models,
    // Returning the last known list keeps the offline phase from blanking the catalog.
    async refreshModels({ allowNetwork, force, signal }) {
      if (allowNetwork) {
        models = await getModels(baseUrl, apiKey, { force, signal });
      }
      return models;
    },
  });
}
