import { z } from "zod";
import { type Monitor, type Period, providersSchema, quotasSchema, usageSchema } from "./monitor-contract.ts";
import { gatewayURL, readJson } from "./proxy.ts";

export interface MonitorSettings {
  gatewayUrl: string;
  gatewayKey: string;
  webUrl: string;
  webKey: string;
  webLink: string;
}

// Go encodes nil slices as null. Missing fields still indicate API drift.
function list<T extends z.ZodType>(item: T) {
  return z.array(item).nullable().transform((value) => value ?? []);
}
const bucket = usageSchema.shape.series.element;
const named = usageSchema.shape.agents.element;
// /v1/magpie/usage/requests covers gateway requests and local agent sessions, with per-agent buckets.
// It always returns a page of request rows; they are dropped here and never reach the browser.
const rawUsage = usageSchema.omit({ series: true, agents: true, models: true }).extend({
  series: list(bucket.omit({ agents: true }).extend({
    by: z.object({ agent: bucket.shape.agents.nullable() }),
  })),
  by: z.object({ agent: list(named), model: list(named) }),
}).transform(({ series, by, ...usage }) => ({
  ...usage,
  series: series.map(({ by, ...bucket }) => ({ ...bucket, agents: by.agent ?? {} })),
  agents: by.agent,
  models: by.model,
}));
const rawProviders = providersSchema.extend({ providers: list(providersSchema.shape.providers.element) });
const rawQuotas = list(quotasSchema.element.extend({ windows: list(quotasSchema.element.shape.windows.element) }));

const parsers = {
  health: z.object({ name: z.literal("magpie"), version: z.string() }).transform(({ version }) => ({ version })),
  providers: rawProviders,
  usage: rawUsage,
  quotas: rawQuotas,
};

class MonitorError extends Error {}
class HttpError extends MonitorError {
  readonly status: number;
  constructor(label: string, status: number) {
    super(`${label} returned HTTP ${status}. Check its address and access key.`);
    this.status = status;
  }
}

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
  // Not async: callers compare the returned promise with `login` to clear only the session they used.
  function cookie(config: MonitorSettings): Promise<string> {
    if (!config.webUrl || !config.webKey) {
      return Promise.reject(new MonitorError("Set the Magpie Web UI origin and Web UI key in the plugin settings."));
    }
    if (!login) {
      const pending = (async () => {
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
      login = pending;
      // A rejected login is retried on the next snapshot.
      void pending.catch(() => {
        if (login === pending) login = undefined;
      });
    }
    return login;
  }
  async function read<T>(origin: string, path: string, headers: HeadersInit, schema: z.ZodType<T>, label: string) {
    const response = await request(new URL(path, gatewayURL(origin)), headers, label);
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(label, response.status);
    }
    // Bound source responses before parsing; raise the cap only for a larger verified catalog.
    const value = await readJson(response, 4 * 1024 * 1024, label, MonitorError);
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
    const web = async <T>(path: string, schema: z.ZodType<T>) => {
      const session = cookie(config);
      try {
        return await read(config.webUrl, path, { cookie: await session }, schema, "Magpie Web UI");
      } catch (error) {
        // An expired session signs in again on the next snapshot; a newer login stays in place.
        if (error instanceof HttpError && error.status === 401 && login === session) login = undefined;
        throw error;
      }
    };
    const [health, providers, usage, quotas] = await Promise.all([
      section(() => read(config.gatewayUrl, "/api/hello", gatewayHeaders, parsers.health, "Magpie gateway")),
      section(() => web("/api/providers", parsers.providers)),
      section(() =>
        read(
          config.gatewayUrl,
          `/v1/magpie/usage/requests?period=${period}`,
          gatewayHeaders,
          parsers.usage,
          "Magpie usage",
        )
      ),
      section(() => web("/api/usage/quotas", parsers.quotas)),
    ]);
    const origin = (value: string) => {
      try {
        return gatewayURL(value).origin;
      } catch {
        return "";
      }
    };
    // The browser opens this link directly, so it may have a path but never embedded credentials.
    const link = (value: string) => {
      try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
      } catch {
        return "";
      }
    };
    return {
      updatedAt: new Date().toISOString(),
      webLink: link(config.webLink) || origin(config.webUrl),
      webConfigured: Boolean(config.webUrl && config.webKey),
      health,
      providers,
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
