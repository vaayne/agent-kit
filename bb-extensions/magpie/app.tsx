import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import type { Monitor, monitorRpc, Period, SyncResult } from "./monitor-contract.ts";

type Quota = Extract<Monitor["quotas"], { ok: true }>["data"][number];
// Same artwork as assets/icon.svg, which the manifest cannot share with app-registered icons.
const magpiePath =
  "M1.31 3.44L1.17 4.35L1.52 5.40L2.15 6.30L4.66 9.24L4.59 9.31L1.03 5.61L0.89 5.61L0.89 6.58L1.03 7.07L1.31 7.56L2.01 8.26L3.54 9.45L4.73 10.57L4.59 10.64L2.57 8.96L0.89 7.91L0.89 8.47L1.17 9.17L1.94 10.01L4.38 11.62L5.08 12.31L6.06 13.85L7.11 12.94L7.25 13.01L5.57 14.90L4.59 16.58L5.29 16.23L6.69 15.88L6.76 15.95L6.62 16.09L5.71 16.44L5.22 16.93L5.99 17L6.97 17.35L8.02 18.04L9.27 19.09L10.67 19.93L11.86 20.35L12.77 20.49L14.52 20.42L15.91 20L16.89 19.51L17.59 19.02L18.85 17.77L19.69 16.51L20.25 15.32L20.60 14.13L20.74 13.22L20.74 12.03L20.53 10.92L19.62 8.82L19.69 7.84L19.90 7.49L20.32 7.14L20.87 6.86L23.04 6.44L22.83 6.23L21.71 5.75L20.32 5.47L19.41 4.70L18.57 4.28L17.59 4.07L16.19 4.28L15.49 4.63L14.52 5.54L13.12 8.12L11.93 9.38L9 11.41L8.72 11.41L7.74 10.92L6.76 10.01L6.13 9.10L4.80 6.30L3.96 5.12L2.64 3.93L1.87 3.51ZM20.18 13.99L20.18 14.48L19.90 15.53L19.34 16.72L18.78 17.56L17.94 18.46L17.24 19.02L15.49 19.93L14.38 20.21L12.42 20.21L11.79 20.07L10.18 19.37L9.20 18.46L9 18.11L8.93 17.42L9 17.21L9.41 16.79L11.93 15.60L13.96 14.27L15.21 12.94L15.91 11.69L16.19 10.92L16.40 11.06L17.10 12.31L17.80 13.01L18.57 13.50L19.69 13.85L20.04 13.85ZM16.12 9.73L16.19 10.08L15.77 10.85L15.07 11.48L14.03 12.03L11.16 12.94L8.65 13.57L8.23 13.50L9 12.38L10.60 10.78L12 9.87L14.10 9.17L15.42 9.17L15.77 9.31ZM18.01 5.54L18.29 5.40L18.50 5.54L18.50 5.75L18.36 5.89L18.15 5.89L18.01 5.75Z";

const number = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat();
const dollars = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const control =
  "rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
const muted = "text-xs text-muted-foreground";
const policy = (value: string) => value || "Auto";
const duration = (value: number) => value ? `${(value / 1000).toFixed(1)}s` : "—";

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function syncSummary(result: SyncResult) {
  const pi = result.pi.ok
    ? `Pi: ${result.pi.machines.length} machines updated${result.pi.refreshed ? ", provider refreshed" : ""}.`
    : "error" in result.pi
    ? `Pi: ${result.pi.error}`
    : `Pi: ${result.pi.machines.filter((entry) => !entry.ok).map((entry) => `${entry.machine}: ${entry.error}`).join("; ")}`;
  const native = result.bb.ok
    ? `BB pickers: ${result.bb.total} models, ${result.bb.added} added, ${result.bb.removed} removed.`
    : `BB pickers: ${result.bb.error}`;
  return `${pi} ${native}`;
}
const resetTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
function timeLeft(value: string) {
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60_000));
  return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`
    : minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}
function resetLabel(value: string) {
  return `Resets in ${timeLeft(value)} · ${resetTime.format(new Date(value))}`;
}
function QuotaCards({ accounts, className }: { accounts: Quota[]; className: string }) {
  return (
    <div className={className}>
      {accounts.map((account) => (
        <div key={`${account.provider}:${account.user ?? account.name}`} className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold">{account.name}{account.plan ? ` · ${account.plan}` : ""}</p>
              {account.balance ? <p className={`${muted} shrink-0`}>{account.balance}</p> : null}
            </div>
            {account.user ? <p className={`${muted} mt-0.5 truncate`} title={account.user}>{account.user}</p> : null}
          </div>
          {account.windows.map((window) => (
            <div key={window.name} className="space-y-1">
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate">{window.name}</span>
                <span className="shrink-0 tabular-nums">{Math.round(window.used)}% used</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={`${account.name} ${window.name}`}
                aria-valuenow={window.used}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full ${window.used >= 90 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${Math.min(100, window.used)}%` }}
                />
              </div>
              {window.resetsAt ? <p className={muted}>{resetLabel(window.resetsAt)}</p> : null}
            </div>
          ))}
          {!account.windows.length && !account.balance ? <p className={muted}>No allowance data</p> : null}
        </div>
      ))}
    </div>
  );
}
function Subscriptions({ data }: { data: Monitor }) {
  if (!data.webConfigured) return null;
  if (!data.quotas.ok) return <Notice>{data.quotas.error}</Notice>;
  if (!data.quotas.data.length) return null;
  return (
    <Panel title="Subscriptions" detail="Allowance used in each window, as Magpie last read it.">
      <QuotaCards accounts={data.quotas.data} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" />
    </Panel>
  );
}
// Magpie quota providers that match a BB agent provider, for its icon.
const agentProvider: Record<string, string> = { claude: "claude-code", codex: "codex" };
// "7 days Sonnet" -> "7d Sonnet", to fit the narrow sidebar row.
const windowLabel = (name: string) =>
  name.replace(/^(\d+) (hour|day|week|month)s?\b/, (_, count: string, unit: string) =>
    `${count}${unit === "month" ? "mo" : unit[0]}`);
// The sidebar footer shows only allowance, so it polls slower than the full dashboard.
function SubscriptionUsage() {
  const rpc = useRpc<typeof monitorRpc>();
  const providers = experimental_useProviders();
  const [data, setData] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const next = await rpc.call("monitor", { period: "today" });
        if (alive) {
          setData(next);
          setError(null);
        }
      } catch {
        if (alive) setError("Cannot read Magpie subscription usage.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [rpc, refresh]);
  const message = error ?? (!data
    ? "Loading subscription usage…"
    : !data.webConfigured
    ? "Set the Magpie Web UI origin and key in the plugin settings."
    : !data.quotas.ok
    ? data.quotas.error
    : !data.quotas.data.length
    ? "Magpie reports no subscriptions."
    : null);
  return (
    <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden text-xs text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="flex items-center gap-1.5 font-medium">
          <MagpieIcon className="size-3.5" />
          Magpie
        </span>
        <button
          type="button"
          aria-label="Refresh subscription usage"
          title="Refresh"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {message || !data?.quotas.ok
        ? <p className="px-3 py-2.5 text-muted-foreground">{message}</p>
        : (
          // Accounts share one grid through subgrid, so every window column lines up.
          <div className="grid grid-cols-[fit-content(5rem)_minmax(1.5rem,1fr)_max-content_max-content] gap-x-2 tabular-nums">
            {data.quotas.data.map((account) => {
              const id = agentProvider[account.provider];
              const provider = providers.providers.find((entry) => entry.id === id);
              return (
                <div
                  key={`${account.provider}:${account.user ?? account.name}`}
                  className="col-span-full grid grid-cols-subgrid items-center gap-y-1.5 border-t border-border px-3 py-2.5 first:border-t-0"
                >
                  <div className="col-span-full flex min-w-0 items-center gap-1.5">
                    {id
                      ? <ProviderIcon providerKind="agent" provider={provider ?? { id }} className="size-3.5 shrink-0" />
                      : <span className="size-3.5 shrink-0" />}
                    <span className="min-w-0 truncate font-medium" title={account.user ?? account.name}>
                      {account.user ?? account.name}
                    </span>
                    {account.plan
                      ? <span className="ml-auto shrink-0 rounded bg-muted px-1 text-[11px] capitalize text-muted-foreground">{account.plan}</span>
                      : null}
                  </div>
                  {account.windows.map((window) => (
                    <Fragment key={window.name}>
                      <span
                        className="truncate text-muted-foreground"
                        title={window.resetsAt ? `${window.name} · ${resetLabel(window.resetsAt)}` : window.name}
                      >
                        {windowLabel(window.name)}
                      </span>
                      <div
                        className="h-1 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={`${account.name} ${window.name}`}
                        aria-valuenow={Math.round(window.used)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`h-full rounded-full ${window.used >= 90 ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, window.used)}%` }}
                        />
                      </div>
                      <span className="text-right">{Math.round(window.used)}%</span>
                      <span className="text-right text-muted-foreground">
                        {window.resetsAt ? timeLeft(window.resetsAt) : ""}
                      </span>
                    </Fragment>
                  ))}
                  {account.balance ? <p className="col-span-full text-muted-foreground">{account.balance}</p> : null}
                  {!account.windows.length && !account.balance
                    ? <p className="col-span-full text-muted-foreground">No allowance data</p>
                    : null}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}
function MagpieIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d={magpiePath} />
    </svg>
  );
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-4 py-1">
      <p className={muted}>{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight" title={value}>{value}</p>
      <p className={`${muted} mt-1`}>{detail}</p>
    </div>
  );
}
function Panel({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail ? <p className={`${muted} mt-1`}>{detail}</p> : null}
      </div>
      {children}
    </section>
  );
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
const cell = "px-4 py-3 tabular-nums";

function Gateway({ data }: { data: Monitor }) {
  const providers = data.providers;
  return (
    <div className="space-y-7">
      <Panel title="BB connection" detail="Native routing defaults. A thread can override its default.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Codex", data.connector.codex ? "Through Magpie" : "Direct"],
            ["Claude Code", data.connector.claude ? "Through Magpie" : "Direct"],
            ["Pi catalog", data.connector.autoSync ? "Auto sync · every 30s" : "Manual sync"],
          ].map(([name, value]) => (
            <div key={name} className="rounded-lg border border-border p-4">
              <p className={muted}>{name}</p>
              <p className="mt-1 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      </Panel>
      {!providers.ok ? <Notice>{providers.error}</Notice> : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Gateway:{" "}
              <strong className="text-foreground">{providers.data.gateway.running ? "Running" : "Stopped"}</strong>
            </span>
            <span>
              Models: <strong className="text-foreground">{providers.data.gateway.models}</strong>
            </span>
            <span>
              Network sharing: <strong className="text-foreground">{providers.data.gateway.lan ? "On" : "Off"}</strong>
            </span>
            <span>
              Served by:{" "}
              <strong className="text-foreground">
                {providers.data.gateway.mine ? "Web process" : "Another Magpie process"}
              </strong>
            </span>
          </div>
          <Panel title="Providers" detail="Availability and routing policy reported by Magpie.">
            {providers.data.providers.length
              ? (
                <Table headings={["Provider", "State", "Models", "Routing", "Affinity"]}>
                  {providers.data.providers.map((provider) => (
                    <tr key={provider.id}>
                      <td className={cell}>
                        <div className="font-medium">{provider.name}</div>
                        <div className={`${muted} mt-0.5`}>{provider.id}</div>
                      </td>
                      <td className={cell}>{provider.off ? "Disabled" : provider.ready ? "Ready" : "Not ready"}</td>
                      <td className={cell}>{provider.exposed}</td>
                      <td className={cell}>{policy(provider.routing)}</td>
                      <td className={cell}>{policy(provider.affinity)}</td>
                    </tr>
                  ))}
                </Table>
              )
              : <Notice>No providers are configured.</Notice>}
          </Panel>
        </>
      )}
    </div>
  );
}

function Routing({ data }: { data: Monitor }) {
  const trace = data.trace;
  const groups = data.groups;
  return (
    <div className="space-y-7">
      <Panel
        title="Recent requests"
        detail="The newest 30 requests retained by the running gateway. Counters reset when that process restarts."
      >
        {!trace.ok
          ? <Notice>{trace.error}</Notice>
          : !trace.data.mine
          ? (
            <Notice>
              The Web UI process does not own the gateway. Live routing data is available only from the process that
              serves it.
            </Notice>
          )
          : (
            <>
              <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
                <span>{exact.format(trace.data.totals.requests)} requests</span>
                <span>{exact.format(trace.data.totals.rerouted)} rerouted</span>
                <span>{exact.format(trace.data.totals.errors)} errors</span>
                <span>Showing {trace.data.routes.length} of {trace.data.totalRoutes} retained</span>
              </div>
              {trace.data.routes.length
                ? (
                  <Table
                    headings={[
                      "Time / client",
                      "Model / provider",
                      "State",
                      "Attempts",
                      "Duration",
                      "First token",
                      "Tokens",
                    ]}
                  >
                    {trace.data.routes.map((route) => (
                      <tr key={route.id}>
                        <td className={`${cell} whitespace-nowrap`}>
                          <time dateTime={route.time}>{new Date(route.time).toLocaleTimeString()}</time>
                          <div className={`${muted} mt-0.5`}>{route.agent || "Unknown client"}</div>
                        </td>
                        <td className={`${cell} max-w-80 break-words`}>
                          <div className="font-medium">{route.model}</div>
                          <div className={`${muted} mt-0.5`}>{route.provider}</div>
                        </td>
                        <td className={`${cell} whitespace-nowrap ${route.failed ? "text-destructive" : ""}`}>
                          {!route.done
                            ? "In progress"
                            : route.failed
                            ? `Failed${route.status ? ` · ${route.status}` : ""}`
                            : `Done${route.status ? ` · ${route.status}` : ""}`}
                        </td>
                        <td className={cell}>{route.tries}</td>
                        <td className={cell}>{duration(route.ms)}</td>
                        <td className={cell}>{duration(route.ttft)}</td>
                        <td className={cell}>{route.tokens ? number.format(route.tokens) : "—"}</td>
                      </tr>
                    ))}
                  </Table>
                )
                : <Notice>No requests are retained by this gateway process yet.</Notice>}
            </>
          )}
      </Panel>
      <Panel title="Routing groups" detail="Current group members and selection rules.">
        {!groups.ok
          ? <Notice>{groups.error}</Notice>
          : groups.data.length
          ? (
            <div className="grid gap-3 md:grid-cols-2">
              {groups.data.map((group) => (
                <div key={group.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium">{group.name}</h3>
                    <span className={muted}>{group.ready ? "Ready" : "Not ready"}</span>
                  </div>
                  <p className={`${muted} mt-1`}>{policy(group.routing)} · affinity {policy(group.affinity)}</p>
                  <ul className="mt-3 space-y-1 text-xs font-mono break-all">
                    {group.members.map((member) => <li key={member}>{member}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )
          : <Notice>No routing groups are configured. Requests use each provider's routing policy.</Notice>}
      </Panel>
    </div>
  );
}

function Usage({ data }: { data: Monitor }) {
  if (!data.usage.ok) return <Notice>{data.usage.error}</Notice>;
  const usage = data.usage.data;
  const peak = Math.max(1, ...usage.series.map((point) => point.calls));
  return (
    <div className="space-y-7">
      <Panel
        title="Request activity"
        detail="Magpie's usage log includes gateway requests and supported agent session logs. Period boundaries use the Magpie server's time zone."
      >
        <div className="rounded-lg border border-border p-4">
          <div
            className="flex h-32 items-end gap-1"
            role="img"
            aria-label={`${exact.format(usage.calls)} requests in the selected period`}
          >
            {usage.series.map((point) => (
              <div key={point.time} className="group relative flex h-full min-w-0 flex-1 items-end">
                <div
                  tabIndex={0}
                  aria-label={`${point.label}: ${point.calls} requests, ${point.errors} errors`}
                  title={`${point.label}: ${exact.format(point.calls)} requests · ${point.errors} errors`}
                  className="w-full rounded-t-sm bg-primary/65 hover:bg-primary focus:bg-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  style={{ height: `${point.calls / peak * 100}%`, minHeight: 2 }}
                />
              </div>
            ))}
          </div>
          <div className={`${muted} mt-3 flex justify-between gap-3`}>
            <span>{usage.series[0]?.label ?? "No activity"}</span>
            <span>{usage.series.at(-1)?.label}</span>
          </div>
        </div>
      </Panel>
      <Panel
        title="Usage by model"
        detail="USD values are estimates from Magpie's model prices. They are not an invoice."
      >
        {usage.models.length
          ? (
            <Table headings={["Model", "Requests", "Errors", "Input / output", "Cache read / write", "Est. USD"]}>
              {[...usage.models].sort((a, b) => b.calls - a.calls).map((model) => (
                <tr key={model.id}>
                  <td className={`${cell} max-w-80 break-words`}>
                    <div className="font-medium">{model.name}</div>
                    <div className={`${muted} mt-0.5`}>{model.sub}</div>
                  </td>
                  <td className={cell}>{exact.format(model.calls)}</td>
                  <td className={`${cell} ${model.errors ? "text-destructive" : ""}`}>{model.errors}</td>
                  <td
                    className={`${cell} whitespace-nowrap`}
                    title={`${exact.format(model.input)} input / ${exact.format(model.output)} output`}
                  >
                    {number.format(model.input)} / {number.format(model.output)}
                  </td>
                  <td
                    className={`${cell} whitespace-nowrap`}
                    title={`${exact.format(model.cache_read)} read / ${exact.format(model.cache_write)} write`}
                  >
                    {number.format(model.cache_read)} / {number.format(model.cache_write)}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>
                    {dollars.format(model.cost)}
                    {model.unpriced ? <div className={muted}>{model.unpriced} unpriced</div> : null}
                  </td>
                </tr>
              ))}
            </Table>
          )
          : <Notice>No usage is recorded for this period.</Notice>}
      </Panel>
    </div>
  );
}

function Dashboard() {
  const rpc = useRpc<typeof monitorRpc>();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"Gateway" | "Routing" | "Usage">("Gateway");
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      setSyncResult(syncSummary(await rpc.call("syncModels", {})));
    } catch (cause) {
      setSyncResult(cause instanceof Error ? cause.message : "Cannot sync Magpie models.");
    } finally {
      setSyncing(false);
    }
  }
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let visible = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      if (!alive || inFlight || !visible || document.hidden) return;
      inFlight = true;
      setLoading(true);
      try {
        const next = await rpc.call("monitor", { period });
        if (alive) {
          setData(next);
          setError(null);
        }
      } catch {
        if (alive) setError("Cannot refresh the Magpie monitor. The values below may be out of date.");
      } finally {
        inFlight = false;
        if (alive) {
          setLoading(false);
          if (!paused && visible && !document.hidden) timer = setTimeout(() => void load(), 5_000);
        }
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!paused) void load();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      onVisibility();
    });
    if (root.current) observer.observe(root.current);
    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rpc, period, paused, refresh]);

  const usage = data?.usage.ok && data.usage.data.period === period ? data.usage.data : null;
  return (
    <div ref={root} className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-7 p-4 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={`h-2 w-2 rounded-full ${data?.health.ok ? "bg-primary" : "bg-muted-foreground"}`} />
              {!data
                ? "Connecting…"
                : data.health.ok
                ? `Gateway online · v${data.health.data.version}`
                : "Gateway unavailable"}
            </div>
            <p className={`${muted} mt-1.5 break-all`}>{data?.gatewayUrl ?? "Reading Magpie status"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="magpie-period">Usage period</label>
            <select
              id="magpie-period"
              className={control}
              value={period}
              onChange={(event) => setPeriod(event.target.value as Period)}
            >
              <option value="today">Today</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
            <button
              type="button"
              className={control}
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className={control}
              disabled={syncing}
              title="Sync Magpie models to Pi and to the Codex and Claude Code pickers"
              onClick={() => void sync()}
            >
              {syncing ? "Syncing…" : "Sync models"}
            </button>
            <button
              type="button"
              className={control}
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{paused ? "Auto refresh paused" : "Auto refresh · 5s while visible"}</span>
          <span>
            {data ? `Updated ${new Date(data.updatedAt).toLocaleTimeString()}` : "Waiting for the first snapshot"}
          </span>
        </div>
        {syncResult ? <Notice>{syncResult}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {data && !data.health.ok ? <Notice>{data.health.error}</Notice> : null}
        {data && !data.webConfigured
          ? (
            <Notice>
              Set the Web UI origin and Web UI key in Settings → Plugins → Magpie to show gateway details and routing.
            </Notice>
          )
          : null}
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-4" aria-label="Usage summary">
          <Metric
            label="Requests"
            value={usage ? number.format(usage.calls) : "—"}
            detail={usage ? `${exact.format(usage.calls)} in the selected period` : "Usage unavailable"}
          />
          <Metric
            label="Errors"
            value={usage ? number.format(usage.errors) : "—"}
            detail={usage
              ? usage.calls ? `${(100 * usage.errors / usage.calls).toFixed(1)}% of requests` : "No requests"
              : "Usage unavailable"}
          />
          <Metric
            label="Input + output tokens"
            value={usage ? number.format(usage.input + usage.output) : "—"}
            detail={usage
              ? `${number.format(usage.cache_read + usage.cache_write)} cache tokens counted separately`
              : "Usage unavailable"}
          />
          <Metric
            label="Estimated cost"
            value={usage ? dollars.format(usage.cost) : "—"}
            detail={usage
              ? usage.unpriced ? `${usage.unpriced} requests have no known price` : "USD · model price estimate"
              : "Usage unavailable"}
          />
        </div>
        {data ? <Subscriptions data={data} /> : null}
        <nav aria-label="Magpie views" className="flex gap-5 border-b border-border">
          {(["Gateway", "Routing", "Usage"] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
              className={`border-b-2 pb-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
                tab === name
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </nav>
        {!data
          ? <Notice>Loading gateway, routing and usage data…</Notice>
          : tab === "Gateway"
          ? <Gateway data={data} />
          : tab === "Routing"
          ? <Routing data={data} />
          : data.usage.ok && data.usage.data.period !== period
          ? <Notice>Loading the selected period…</Notice>
          : <Usage data={data} />}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.experimental_icons.register({ name: "magpie/logo", component: MagpieIcon });
  app.slots.navPanel({ id: "monitor", title: "Magpie", icon: "magpie/logo", path: "monitor", component: Dashboard });
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "subscriptions",
    label: "Magpie subscription usage",
    icon: "magpie/logo",
    component: SubscriptionUsage,
  });
});
