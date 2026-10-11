import { z } from "zod";

const text = z.string().min(1).max(1024);
const positiveLimit = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const apiSchema = z.enum([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
]);

// Keep known Pi request options. Strip unknown keys at every object boundary;
// endpoint, header, and credential fields must never enter the catalog.
const compatSchema = z.object({
  sendSessionAffinityHeaders: z.boolean().optional(),
  forceAdaptiveThinking: z.boolean().optional(),
});

const effort = text.nullable().optional();
const thinkingLevelMapSchema = z.object({
  off: effort,
  minimal: effort,
  low: effort,
  medium: effort,
  high: effort,
  xhigh: effort,
  max: effort,
});
const costSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});
const modelSourceSchema = z.object({
  id: text,
  name: text.optional(),
  api: apiSchema.optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.enum(["text", "image"])).min(1).max(2)
    .refine((input) => new Set(input).size === input.length).optional(),
  compat: compatSchema.optional(),
  thinkingLevelMap: thinkingLevelMapSchema.optional(),
  promptCache: z.object({
    short: positiveLimit.optional(),
    long: positiveLimit.optional(),
  }).optional(),
  cost: costSchema.optional(),
  contextWindow: positiveLimit.optional(),
  maxTokens: positiveLimit.optional(),
});

// Pi's models.json contract permits omitted metadata. These defaults match
// Pi's provider-composer modelFromJson; extension types require
// concrete values. Preserve explicit limits, even above Pi's defaults.
const modelSchema = modelSourceSchema.extend({
  name: text,
  api: apiSchema.default("openai-completions"),
  reasoning: z.boolean().default(false),
  input: modelSourceSchema.shape.input.default(["text"]),
  cost: costSchema.default({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
  contextWindow: positiveLimit.default(128000),
  maxTokens: positiveLimit.default(16384),
});

// One gateway catalog: 1024 models and 1 MiB of retained metadata. Increase
// these limits only when a real Magpie catalog needs more capacity.
export const catalogSchema = z.object({
  models: z.array(modelSchema).min(1).max(1024),
  defaultModel: text,
}).superRefine((catalog, context) => {
  const ids = new Set(catalog.models.map((model) => model.id));
  if (ids.size !== catalog.models.length) {
    context.addIssue({ code: "custom", message: "Duplicate model IDs" });
  }
  if (!ids.has(catalog.defaultModel)) {
    context.addIssue({ code: "custom", message: "Default model is absent" });
  }
  if (Buffer.byteLength(JSON.stringify(catalog), "utf8") > 1024 * 1024) {
    context.addIssue({ code: "custom", message: "Catalog exceeds 1 MiB" });
  }
});

export type Catalog = z.infer<typeof catalogSchema>;

const sourceSchema = z.object({
  providers: z.object({
    magpie: z.object({
      api: apiSchema.optional(),
      compat: compatSchema.optional(),
      models: z.array(modelSourceSchema).min(1).max(1024),
    }),
  }),
});
const settingsSchema = z.object({
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
});

/** Read parsed models.json and settings.json without retaining source secrets. */
export function parseMagpieConfig(models: unknown, settings: unknown): Catalog {
  const source = sourceSchema.safeParse(models);
  // Never attach Zod errors or raw input: either can contain source secrets.
  if (!source.success) throw new Error("Invalid Magpie provider configuration");
  const provider = source.data.providers.magpie;
  const sanitizedModels = provider.models.map((model) => ({
    ...model,
    name: model.name ?? model.id,
    api: model.api ?? provider.api ?? "openai-completions",
    ...(provider.compat || model.compat
      ? {
        compat: { ...provider.compat, ...model.compat },
      }
      : {}),
  }));
  const selected = settingsSchema.safeParse(settings);
  const defaultModel = selected.success
      && ["magpie", "bb-magpie"].includes(selected.data.defaultProvider ?? "")
      && sanitizedModels.some((model) => model.id === selected.data.defaultModel)
    ? selected.data.defaultModel!
    : sanitizedModels[0]!.id;
  const catalog = catalogSchema.safeParse({ models: sanitizedModels, defaultModel });
  if (!catalog.success) throw new Error("Invalid Magpie model catalog");
  return catalog.data;
}
