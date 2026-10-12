import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const periodSchema = z.enum(["today", "7d", "30d"]);
export type Period = z.infer<typeof periodSchema>;
const count = z.number().int().nonnegative();
// Go encodes time.Time as RFC 3339; the page formats these values, so reject anything else here.
const time = z.iso.datetime({ offset: true });
export const totalsSchema = z.object({
  calls: count,
  errors: count,
  input: count,
  output: count,
  cache_read: count,
  cache_write: count,
  reasoning: count,
  cost: z.number().nonnegative(),
  unpriced: count,
});
// Tokens are input + output + cache reads + cache writes, as Magpie counts them per agent.
export const usageSchema = totalsSchema.extend({
  period: periodSchema,
  bucket: z.enum(["hour", "day"]),
  series: z.array(totalsSchema.extend({
    label: z.string(),
    time,
    agents: z.record(z.string(), z.object({ tokens: count, cost: z.number().nonnegative() })),
  })),
  agents: z.array(totalsSchema.extend({ id: z.string(), name: z.string() })),
  models: z.array(totalsSchema.extend({ id: z.string(), name: z.string() })),
});
export const providersSchema = z.object({ providers: z.array(z.object({ ready: z.boolean(), off: z.boolean() })) });
export const quotasSchema = z.array(z.object({
  provider: z.string(),
  name: z.string(),
  plan: z.string().optional(),
  user: z.string().optional(),
  // used is a percentage of the window's allowance.
  windows: z.array(z.object({ name: z.string(), used: z.number().nonnegative(), resetsAt: time.optional() })),
  balance: z.string().optional(),
}));
function section<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]);
}
export const monitorSchema = z.object({
  updatedAt: z.string(),
  // URL that the browser opens for Magpie Web; empty when no valid link or Web UI origin is set.
  webLink: z.string(),
  webConfigured: z.boolean(),
  health: section(z.object({ version: z.string() })),
  providers: section(providersSchema),
  usage: section(usageSchema),
  quotas: section(quotasSchema),
});
export type Monitor = z.infer<typeof monitorSchema>;
const failure = z.object({ ok: z.literal(false), error: z.string() });
export const syncSchema = z.object({
  ok: z.boolean(),
  pi: z.union([
    z.object({
      ok: z.boolean(),
      defaultModel: z.string(),
      machines: z.array(z.object({ machine: z.string(), ok: z.boolean(), error: z.string().optional() }).loose()),
      refreshed: z.boolean(),
    }),
    failure,
  ]),
  bb: z.union([
    z.object({ ok: z.literal(true), added: z.number(), removed: z.number(), total: z.number(), changed: z.boolean() }),
    failure,
  ]),
});
export type SyncResult = z.infer<typeof syncSchema>;
export const monitorRpc = defineRpcContract({
  monitor: { input: z.object({ period: periodSchema }).strict(), output: monitorSchema },
  syncModels: { input: z.object({}).strict(), output: syncSchema },
});
