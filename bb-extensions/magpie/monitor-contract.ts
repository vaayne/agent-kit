import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const periodSchema = z.enum(["today", "7d", "30d"]);
export type Period = z.infer<typeof periodSchema>;
const count = z.number().int().nonnegative();
export const totalsSchema = z.object({
  calls: count,
  errors: count,
  input: count,
  output: count,
  cache_read: count,
  cache_write: count,
  cost: z.number().nonnegative(),
  unpriced: count,
});
export const usageSchema = totalsSchema.extend({
  period: periodSchema,
  since: z.string(),
  series: z.array(totalsSchema.extend({ label: z.string(), time: z.string() })),
  models: z.array(totalsSchema.extend({ id: z.string(), name: z.string(), sub: z.string().optional() })),
  agents: z.array(totalsSchema.extend({ id: z.string(), name: z.string() })),
});
export const providersSchema = z.object({
  gateway: z.object({ running: z.boolean(), mine: z.boolean(), lan: z.boolean(), models: count }),
  providers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    ready: z.boolean(),
    off: z.boolean(),
    exposed: count,
    routing: z.string(),
    affinity: z.string(),
  })),
});
export const groupsSchema = z.array(z.object({
  id: z.string(),
  name: z.string(),
  ready: z.boolean(),
  routing: z.string(),
  affinity: z.string(),
  members: z.array(z.string()),
}));
export const traceSchema = z.object({
  mine: z.boolean(),
  totals: z.object({ requests: count, rerouted: count, errors: count }),
  routes: z.array(z.object({
    id: count,
    time: z.string(),
    agent: z.string(),
    model: z.string(),
    provider: z.string(),
    done: z.boolean(),
    failed: z.boolean(),
    status: count,
    ms: count,
    tokens: count,
    ttft: count,
    tries: count,
  })),
  totalRoutes: count,
});
function section<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]);
}
export const monitorSchema = z.object({
  updatedAt: z.string(),
  gatewayUrl: z.string(),
  webConfigured: z.boolean(),
  connector: z.object({ codex: z.boolean(), claude: z.boolean(), autoSync: z.boolean() }),
  health: section(z.object({ version: z.string() })),
  providers: section(providersSchema),
  groups: section(groupsSchema),
  trace: section(traceSchema),
  usage: section(usageSchema),
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
