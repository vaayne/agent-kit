import { z } from "zod";
import {
  groupsSchema,
  type Monitor,
  type Period,
  providersSchema,
  quotasSchema,
  totalsSchema,
  usageSchema,
} from "./monitor-contract.ts";
import { gatewayURL } from "./proxy.ts";

export interface MonitorSettings {
  gatewayUrl: string;
  gatewayKey: string;
  webUrl: string;
  webKey: string;
  codexRouting: boolean;
  claudeRouting: boolean;
  autoSync: boolean;
}

// Go encodes nil slices as null. Missing fields still indicate API drift.
function list<T extends z.ZodType>(item: T) {
  return z.array(item).nullable().transform((value) => value ?? []);
}
const rawUsage = usageSchema.extend({
  series: list(totalsSchema.extend({ label: z.string(), time: z.string() })),
  models: list(usageSchema.shape.models.element),
  agents: list(usageSchema.shape.agents.element),
});
const rawProviders = providersSchema.extend({ providers: list(providersSchema.shape.providers.element) });
const rawGroups = z.object({
  groups: list(groupsSchema.element.extend({
    members: list(z.string()),
    routing: z.string().default(""),
    affinity: z.string().default(""),
  })),
});
const rawQuotas = list(quotasSchema.element.extend({ windows: list(quotasSchema.element.shape.windows.element) }));
const rawTrace = z.object({
  mine: z.boolean(),
  totals: z.object({
    requests: z.number().int().nonnegative(),
    rerouted: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }),
  routes: list(z.object({
    id: z.number().int().nonnegative(),
    time: z.string(),
    agent: z.string(),
    model: z.string(),
    provider: z.string(),
    done: z.boolean(),
    error: z.string().optional(),
    status: z.number().int().nonnegative().default(0),
    ms: z.number().int().nonnegative().default(0),
    tokens: z.number().int().nonnegative().default(0),
    ttft: z.number().int().nonnegative().default(0),
    tries: list(z.object({})),
  })),
});

export const parsers = {
  health: z.object({ name: z.literal("magpie"), version: z.string() }).transform(({ version }) => ({ version })),
  providers: rawProviders,
  groups: rawGroups.transform(({ groups }) => groups),
  trace: rawTrace.transform(({ routes, ...trace }) => ({
    ...trace,
    totalRoutes: routes.length,
    // Keep the newest 30 routes. Use pagination if a full history view is added.
    routes: routes.sort((a, b) => b.id - a.id).slice(0, 30).map(({ error, tries, ...route }) => ({
      ...route,
      failed: Boolean(error) || route.status >= 400,
      tries: tries.length,
    })),
  })),
  usage: rawUsage,
  quotas: rawQuotas,
};

class MonitorError extends Error {}

export function createMonitor(readSettings: () => Promise<MonitorSettings>) {
  const lifetime = new AbortController();
  let configKey = "";
  let login: Promise<string> | undefined;
  const cache = new Map<Period, { at: number; result: Promise<Monitor> }>();

  async function request(url: URL, headers: HeadersInit, label: string) {
    try {
      return await fetch(url, {
        headers,
        redirect: "manual",
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(10_000)]),
      });
    } catch (cause) {
      throw new MonitorError(`${label} is unreachable or timed out.`, { cause });
    }
  }
  async function cookie(config: MonitorSettings): Promise<string> {
    if (!config.webUrl || !config.webKey) {
      throw new MonitorError("Set the Magpie Web UI origin and Web UI key in the plugin settings.");
    }
    if (!login) {
      login = (async () => {
        const url = gatewayURL(config.webUrl);
        url.searchParams.set("k", config.webKey);
        const response = await request(url, {}, "Magpie Web UI");
        await response.body?.cancel();
        if (response.status !== 303) {
          throw new MonitorError(`Web UI login returned HTTP ${response.status}. Check the Web UI key.`);
        }
        const value = response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0])
          .find((entry) => /^magpie_web_\d+=[A-Za-z0-9._~-]+$/.test(entry));
        if (!value) throw new MonitorError("Web UI login did not return a Magpie session cookie.");
        return value;
      })();
      // A rejected login is retried on the next snapshot.
      void login.catch(() => {
        login = undefined;
      });
    }
    return login;
  }
  async function read<T>(origin: string, path: string, headers: HeadersInit, schema: z.ZodType<T>, label: string) {
    const response = await request(new URL(path, gatewayURL(origin)), headers, label);
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) login = undefined;
      throw new MonitorError(`${label} returned HTTP ${response.status}. Check its address and access key.`);
    }
    // Bound source responses before parsing; raise the cap only for a larger verified catalog.
    const reader = response.body?.getReader();
    if (!reader) throw new MonitorError(`${label} returned an empty response.`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4 * 1024 * 1024) throw new MonitorError(`${label} response exceeds 4 MiB.`);
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (cause) {
      throw new MonitorError(`${label} returned invalid JSON.`, { cause });
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new MonitorError(`${label} returned an unsupported data format. Check the Magpie version.`, {
        cause: result.error,
      });
    }
    return result.data;
  }
  async function section<T>(action: () => Promise<T>) {
    try {
      return { ok: true as const, data: await action() };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof MonitorError
          ? error.message
          : "Cannot read Magpie data. Check the configured HTTP(S) origins and service availability.",
      };
    }
  }
  async function snapshot(config: MonitorSettings, period: Period): Promise<Monitor> {
    const gatewayHeaders = { authorization: `Bearer ${config.gatewayKey || "magpie-pi"}` };
    const web = async <T>(path: string, schema: z.ZodType<T>) =>
      read(config.webUrl, path, { cookie: await cookie(config) }, schema, "Magpie Web UI");
    const [health, providers, groups, trace, usage, quotas] = await Promise.all([
      section(() => read(config.gatewayUrl, "/api/hello", gatewayHeaders, parsers.health, "Magpie gateway")),
      section(() => web("/api/providers", parsers.providers)),
      section(() => web("/api/groups", parsers.groups)),
      section(() => web("/api/gateway/trace", parsers.trace)),
      section(() =>
        read(config.gatewayUrl, `/v1/magpie/usage?period=${period}`, gatewayHeaders, parsers.usage, "Magpie usage")
      ),
      section(() => web("/api/usage/quotas", parsers.quotas)),
    ]);
    return {
      updatedAt: new Date().toISOString(),
      gatewayUrl: (() => {
        try {
          return gatewayURL(config.gatewayUrl).origin;
        } catch {
          return "Invalid gateway origin";
        }
      })(),
      webConfigured: Boolean(config.webUrl && config.webKey),
      connector: { codex: config.codexRouting, claude: config.claudeRouting, autoSync: config.autoSync },
      health,
      providers,
      groups,
      trace,
      usage,
      quotas,
    };
  }
  return {
    dispose() {
      lifetime.abort();
      cache.clear();
      login = undefined;
    },
    async get(period: Period): Promise<Monitor> {
      if (lifetime.signal.aborted) throw new Error("Magpie monitor is stopping.");
      const config = await readSettings();
      const key = JSON.stringify(config);
      if (key !== configKey) {
        configKey = key;
        login = undefined;
        cache.clear();
      }
      const existing = cache.get(period);
      if (existing && Date.now() - existing.at < 5_000) return existing.result;
      const entry = { at: Infinity, result: snapshot(config, period) };
      cache.set(period, entry);
      try {
        return await entry.result;
      } finally {
        entry.at = Date.now();
      }
    },
  };
}
