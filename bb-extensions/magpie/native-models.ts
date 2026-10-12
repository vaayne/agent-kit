import { z } from "zod";
import { gatewayURL, readJson } from "./proxy.ts";

export const nativeProviderSchema = z.enum(["codex", "claude-code"]);
type NativeProvider = z.infer<typeof nativeProviderSchema>;
type NativeModel = { id: string; name: string; efforts: string[] };

const catalogSchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1).max(1024),
    display_name: z.string().min(1).max(1024).optional(),
    supported_reasoning_levels: z.array(z.object({ effort: z.string().min(1).max(64) })).max(32).optional(),
  })).min(1).max(1024),
});

export function parseNativeModels(value: unknown): NativeModel[] {
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) throw new Error("Magpie returned an invalid model catalog.");
  const ids = new Set<string>();
  return parsed.data.data.map((model) => {
    if (ids.has(model.id)) throw new Error("Magpie returned duplicate model IDs.");
    ids.add(model.id);
    // Native endpoints describe upstream protocols. Magpie also converts protocols.
    return {
      id: model.id,
      name: model.display_name ?? model.id,
      efforts: model.supported_reasoning_levels?.map((level) => level.effort) ?? [],
    };
  });
}

export async function readNativeModels(
  config: { gatewayUrl: string; gatewayKey: string },
  provider: NativeProvider,
  signal: AbortSignal,
): Promise<NativeModel[]> {
  const agent = provider === "claude-code" ? "claude" : "codex";
  const response = await fetch(new URL("/v1/models", gatewayURL(config.gatewayUrl)), {
    headers: { authorization: `Bearer ${config.gatewayKey || `magpie-${agent}`}`, "user-agent": `${agent}/bb-magpie` },
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Magpie model catalog returned HTTP ${response.status}.`);
  }
  // Match the Pi catalog limit. Increase only for a larger verified catalog.
  return parseNativeModels(await readJson(response, 1024 * 1024, "Magpie model catalog"));
}

const magpiePrefix = "Magpie · ";

export function customModelEntries(provider: NativeProvider, models: NativeModel[]) {
  // The native picker already lists same-family models, and the gateway resolves
  // bare and prefixed IDs to the same upstream model. Dated IDs alias undated ones.
  const native = provider === "codex" ? "codex/" : "claude/";
  const ids = new Set(models.map((model) => model.id));
  return models
    .filter((model) => {
      const undated = model.id.replace(/-\d{8}$/, "");
      return !model.id.startsWith(native) && (undated === model.id || !ids.has(undated));
    })
    .map((model) => ({ providerId: provider, model: model.id, displayName: `${magpiePrefix}${model.name}` }));
}

type CustomModel = ReturnType<typeof customModelEntries>[number];

/** Replace Magpie-owned customModels entries. Entries from other sources stay in place. */
export function replaceMagpieModels(config: unknown, entries: CustomModel[]) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("BB config.json must be a JSON object.");
  }
  const current: unknown = "customModels" in config ? config.customModels : [];
  if (!Array.isArray(current)) throw new Error("BB config.json customModels must be an array.");
  const owned = (value: unknown) =>
    value !== null && typeof value === "object"
    && "displayName" in value && typeof value.displayName === "string" && value.displayName.startsWith(magpiePrefix);
  const kept = current.filter((value) => !owned(value));
  const previous = new Set(current.filter(owned).map((value) => `${value.providerId}\0${value.model}`));
  const next = new Set(entries.map((entry) => `${entry.providerId}\0${entry.model}`));
  return {
    config: { ...config, customModels: [...kept, ...entries] },
    added: [...next].filter((key) => !previous.has(key)).length,
    removed: [...previous].filter((key) => !next.has(key)).length,
    total: entries.length,
  };
}
