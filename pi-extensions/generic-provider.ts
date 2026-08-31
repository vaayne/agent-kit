import { type ExtensionAPI, getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Registers API providers from generic-provider.json.
 *
 * The file owns provider credentials, endpoints, model discovery, filtering,
 * and metadata overrides. OpenAI APIs use `{baseUrl}/models`; Anthropic
 * Messages uses `{baseUrl}/v1/models`. Model IDs determine availability;
 * models.dev supplies canonical pricing and limits before local overrides.
 */
const DEFAULT_API = "openai-responses";
const SUPPORTED_APIS = [
  "openai-responses",
  "openai-completions",
  "anthropic-messages",
] as const;
const CONFIG_FILE = join(getAgentDir(), "generic-provider.json");
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_MODELS_URL = "https://models.dev/models.json";
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_CONTEXT_WINDOW = 256 * 1024;
const DEFAULT_MAX_TOKENS = 32 * 1024;
const MODEL_CACHE_DIR = join(homedir(), ".cache", "pi", "provider-models-v1");

type SupportedApi = (typeof SUPPORTED_APIS)[number];

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

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

type ProviderModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: ModelCost;
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  compat?: Record<string, unknown>;
};

type ModelOverride = Partial<Omit<ProviderModelConfig, "id" | "cost">> & {
  cost?: Partial<ModelCost>;
};

type ProviderModelRules = {
  include?: string[];
  exclude?: string[];
  overrides?: Record<string, ModelOverride>;
};

type GenericProviderConfig = {
  providers: ConfiguredProvider[];
};

type ModelCache = {
  providerId: string;
  api: SupportedApi;
  baseUrl: string;
  fetchedAt: number;
  models: ProviderModelConfig[];
};

type ConfiguredProvider = {
  id: string;
  baseUrl: string;
  apiKey: string;
  api: SupportedApi;
  rules?: ProviderModelRules;
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
    typeof cache.providerId === "string"
    && SUPPORTED_APIS.includes(cache.api)
    && typeof cache.baseUrl === "string"
    && typeof cache.fetchedAt === "number"
    && Array.isArray(cache.models)
    && cache.models.every(isProviderModelConfig)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    throw new Error(`${CONFIG_FILE}: ${field} must be an array of non-empty strings`);
  }
  return value;
}

function parseProviderModelRules(providerId: string, value: unknown): ProviderModelRules | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${CONFIG_FILE}: ${providerId}.models must be an object`);
  const overrides = value.overrides;
  if (overrides !== undefined && !isRecord(overrides)) {
    throw new Error(`${CONFIG_FILE}: ${providerId}.models.overrides must be an object`);
  }

  return {
    include: stringArray(value.include, `${providerId}.models.include`),
    exclude: stringArray(value.exclude, `${providerId}.models.exclude`),
    overrides: overrides as Record<string, ModelOverride> | undefined,
  };
}

function parseConfiguredProvider(id: string, value: unknown): ConfiguredProvider {
  if (!isRecord(value)) throw new Error(`${CONFIG_FILE}: providers.${id} must be an object`);
  const baseUrl = stringValue(value.baseUrl);
  const apiKey = stringValue(value.apiKey);
  if (!baseUrl) throw new Error(`${CONFIG_FILE}: providers.${id}.baseUrl must be a non-empty string`);
  if (!apiKey) throw new Error(`${CONFIG_FILE}: providers.${id}.apiKey must be a non-empty string`);

  return {
    id,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    api: parseApi(id, stringValue(value.api)),
    rules: parseProviderModelRules(id, value.models),
  };
}

async function readGenericProviderConfig(): Promise<GenericProviderConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { providers: [] };
    throw new Error(`Failed to read ${CONFIG_FILE}`, { cause: error });
  }
  if (!isRecord(parsed) || !isRecord(parsed.providers)) {
    throw new Error(`${CONFIG_FILE}: root.providers must be an object`);
  }

  return {
    providers: Object.entries(parsed.providers).map(([id, value]) => parseConfiguredProvider(id, value)),
  };
}

function globMatches(pattern: string, value: string): boolean {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${expression}$`).test(value);
}

function applyModelRules(models: ProviderModelConfig[], rules: ProviderModelRules | undefined): ProviderModelConfig[] {
  if (rules === undefined) return models;

  return models
    .filter((model) => rules.include === undefined || rules.include.some((pattern) => globMatches(pattern, model.id)))
    .filter((model) => !rules.exclude?.some((pattern) => globMatches(pattern, model.id)))
    .map((model) => {
      const override = rules.overrides?.[model.id];
      if (override === undefined) return model;
      return {
        ...model,
        ...override,
        id: model.id,
        cost: { ...model.cost, ...override.cost },
        thinkingLevelMap: override.thinkingLevelMap === undefined
          ? model.thinkingLevelMap
          : { ...model.thinkingLevelMap, ...override.thinkingLevelMap },
        compat: override.compat === undefined ? model.compat : { ...model.compat, ...override.compat },
      };
    });
}

function parseApi(providerId: string, value: string | undefined): SupportedApi {
  const api = value ?? DEFAULT_API;
  if ((SUPPORTED_APIS as readonly string[]).includes(api)) return api as SupportedApi;
  throw new Error(
    `Provider ${providerId}: unsupported API "${api}". `
      + `Supported APIs: ${SUPPORTED_APIS.join(", ")}`,
  );
}

function modelCachePath(providerId: string): string {
  return join(MODEL_CACHE_DIR, `${encodeURIComponent(providerId)}.json`);
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
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : false,
    input: Array.isArray(model.input) && model.input.every((entry) => entry === "text" || entry === "image")
      ? model.input
      : ["text"],
    cost: {
      input: numberOr(cost?.input, 0),
      output: numberOr(cost?.output, 0),
      cacheRead: numberOr(cost?.cacheRead, 0),
      cacheWrite: numberOr(cost?.cacheWrite, 0),
    },
    contextWindow: numberOr(model.contextWindow ?? model.context_window, DEFAULT_CONTEXT_WINDOW),
    maxTokens: numberOr(model.maxTokens ?? model.max_tokens, DEFAULT_MAX_TOKENS),
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
    contextWindow: numberOr(model.limit?.context, DEFAULT_CONTEXT_WINDOW),
    maxTokens: numberOr(model.limit?.output, fallback.maxTokens),
  };
}

async function readModelCache(providerId: string, api: SupportedApi): Promise<ModelCache | undefined> {
  try {
    const cache = JSON.parse(await readFile(modelCachePath(providerId), "utf8")) as unknown;
    return isModelCache(cache) && cache.providerId === providerId && cache.api === api
      ? cache
      : undefined;
  } catch {
    return undefined;
  }
}

async function writeModelCache(
  providerId: string,
  baseUrl: string,
  api: SupportedApi,
  models: ProviderModelConfig[],
): Promise<void> {
  await mkdir(MODEL_CACHE_DIR, { recursive: true });
  await writeFile(
    modelCachePath(providerId),
    JSON.stringify({ providerId, api, baseUrl, fetchedAt: Date.now(), models }, null, 2),
  );
}

async function fetchGatewayModels(
  providerId: string,
  baseUrl: string,
  api: SupportedApi,
  apiKey: string,
  signal?: AbortSignal,
): Promise<GatewayModel[]> {
  const isAnthropic = api === "anthropic-messages";
  const modelsUrl = isAnthropic ? `${baseUrl}/v1/models` : `${baseUrl}/models`;
  const headers: Record<string, string> = isAnthropic
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { authorization: `Bearer ${apiKey}` };
  const response = await fetch(modelsUrl, { headers, signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${providerId} models: ${response.status} ${response.statusText}`);
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

let modelsDevCatalogPromise: Promise<ModelsDevCatalog> | undefined;

function getModelsDevCatalog(): Promise<ModelsDevCatalog> {
  if (!modelsDevCatalogPromise) {
    modelsDevCatalogPromise = fetchModelsDevCatalog().catch((error) => {
      modelsDevCatalogPromise = undefined;
      throw error;
    });
  }
  return modelsDevCatalogPromise;
}

async function fetchModels(
  providerId: string,
  baseUrl: string,
  api: SupportedApi,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ProviderModelConfig[]> {
  const [gatewayResult, catalogResult] = await Promise.allSettled([
    fetchGatewayModels(providerId, baseUrl, api, apiKey, signal),
    getModelsDevCatalog(),
  ]);
  if (gatewayResult.status === "rejected") throw gatewayResult.reason;

  const gatewayModels = gatewayResult.value;
  if (catalogResult.status === "fulfilled") {
    return gatewayModels
      .map((model) => enrichModel(model, catalogResult.value))
      .filter((model) => model !== undefined);
  }

  // models.dev is metadata only. Provider availability must remain usable during an outage.
  return gatewayModels.map(toGatewayModelConfig).filter((model) => model !== undefined);
}

async function getModels(
  providerId: string,
  baseUrl: string,
  api: SupportedApi,
  apiKey: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ProviderModelConfig[]> {
  const cache = await readModelCache(providerId, api);
  const matchingCache = cache?.baseUrl === baseUrl ? cache : undefined;
  if (!options.force && matchingCache && Date.now() - matchingCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return matchingCache.models;
  }

  try {
    const models = await fetchModels(providerId, baseUrl, api, apiKey, options.signal);
    await writeModelCache(providerId, baseUrl, api, models);
    return models;
  } catch (error) {
    if (matchingCache) return matchingCache.models;
    throw error;
  }
}

export default async function genericProvider(pi: ExtensionAPI) {
  const { providers } = await readGenericProviderConfig();

  for (const provider of providers) {
    const rules = provider.rules;
    let models = applyModelRules(
      await getModels(provider.id, provider.baseUrl, provider.api, provider.apiKey),
      rules,
    );

    pi.registerProvider(provider.id, {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      api: provider.api,
      models,
      // Returning the last known list keeps the offline phase from blanking the catalog.
      async refreshModels({ allowNetwork, force, signal }) {
        if (allowNetwork) {
          models = applyModelRules(
            await getModels(provider.id, provider.baseUrl, provider.api, provider.apiKey, { force, signal }),
            rules,
          );
        }
        return models;
      },
    });
  }
}
