import { type ExtensionAPI, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Registers the `cpa` provider from its OpenAI-compatible `/v1/models` endpoint.
 *
 * Credentials come from the `cpa` entry in `~/.pi/agent/auth.json`, with the
 * gateway URL in the credential's provider-scoped `env`:
 *
 *   { "cpa": { "type": "api_key", "key": "sk-...", "env": { "CPA_BASE_URL": "https://..." } } }
 */

const PROVIDER = "cpa";
const BASE_URL_KEY = "CPA_BASE_URL";
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
const MODEL_CACHE_PATH = join(homedir(), ".cache", "pi", "cpa-models.json");

type ProviderModelConfig = {
  id: string;
  name: string;
  reasoning: boolean;
  input: ("text" | "image")[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
};

type ModelCache = {
  baseUrl: string;
  fetchedAt: number;
  models: ProviderModelConfig[];
};

type ModelsResponse = {
  data?: Array<{
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
  }>;
};

function isProviderModelConfig(value: unknown): value is ProviderModelConfig {
  if (typeof value !== "object" || value === null) return false;
  const model = value as ProviderModelConfig;
  return (
    typeof model.id === "string"
    && typeof model.name === "string"
    && typeof model.reasoning === "boolean"
    && Array.isArray(model.input)
    && model.input.every((entry) => entry === "text" || entry === "image")
    && typeof model.cost === "object"
    && model.cost !== null
    && typeof model.cost.input === "number"
    && typeof model.cost.output === "number"
    && typeof model.cost.cacheRead === "number"
    && typeof model.cost.cacheWrite === "number"
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

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function toModelName(model: { id: string; name?: unknown; display_name?: unknown }): string {
  if (typeof model.name === "string") return model.name;
  if (typeof model.display_name === "string") return model.display_name;
  return model.id.split("/").at(-1) ?? model.id;
}

function toModelConfig(model: NonNullable<ModelsResponse["data"]>[number]): ProviderModelConfig | undefined {
  if (typeof model.id !== "string") return undefined;

  return {
    id: model.id,
    name: toModelName({ id: model.id, name: model.name, display_name: model.display_name }),
    reasoning: typeof model.reasoning === "boolean" ? model.reasoning : true,
    input: Array.isArray(model.input) && model.input.every((entry) => entry === "text" || entry === "image")
      ? model.input
      : ["text", "image"],
    cost: {
      input: toNumber((model.cost as { input?: unknown } | undefined)?.input, 0),
      output: toNumber((model.cost as { output?: unknown } | undefined)?.output, 0),
      cacheRead: toNumber((model.cost as { cacheRead?: unknown } | undefined)?.cacheRead, 0),
      cacheWrite: toNumber((model.cost as { cacheWrite?: unknown } | undefined)?.cacheWrite, 0),
    },
    contextWindow: toNumber(model.contextWindow ?? model.context_window, 262144),
    maxTokens: toNumber(model.maxTokens ?? model.max_tokens, 262144),
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

async function fetchModels(baseUrl: string, apiKey: string, signal?: AbortSignal): Promise<ProviderModelConfig[]> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${PROVIDER} models: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as ModelsResponse;
  return (body.data ?? []).map(toModelConfig).filter((model) => model !== undefined);
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
    api: "anthropic-messages",
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
