import {
  definePluginApp,
  experimental_ProviderIcon as ProviderIcon,
  experimental_useProviders,
  UrlLink,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { t } from "./i18n.ts";
import type { Monitor, monitorRpc, Period, SyncResult } from "./monitor-contract.ts";

// Same artwork as assets/icon.svg, which the manifest cannot share with app-registered icons.
const magpiePath =
  "M1.31 3.44L1.17 4.35L1.52 5.40L2.15 6.30L4.66 9.24L4.59 9.31L1.03 5.61L0.89 5.61L0.89 6.58L1.03 7.07L1.31 7.56L2.01 8.26L3.54 9.45L4.73 10.57L4.59 10.64L2.57 8.96L0.89 7.91L0.89 8.47L1.17 9.17L1.94 10.01L4.38 11.62L5.08 12.31L6.06 13.85L7.11 12.94L7.25 13.01L5.57 14.90L4.59 16.58L5.29 16.23L6.69 15.88L6.76 15.95L6.62 16.09L5.71 16.44L5.22 16.93L5.99 17L6.97 17.35L8.02 18.04L9.27 19.09L10.67 19.93L11.86 20.35L12.77 20.49L14.52 20.42L15.91 20L16.89 19.51L17.59 19.02L18.85 17.77L19.69 16.51L20.25 15.32L20.60 14.13L20.74 13.22L20.74 12.03L20.53 10.92L19.62 8.82L19.69 7.84L19.90 7.49L20.32 7.14L20.87 6.86L23.04 6.44L22.83 6.23L21.71 5.75L20.32 5.47L19.41 4.70L18.57 4.28L17.59 4.07L16.19 4.28L15.49 4.63L14.52 5.54L13.12 8.12L11.93 9.38L9 11.41L8.72 11.41L7.74 10.92L6.76 10.01L6.13 9.10L4.80 6.30L3.96 5.12L2.64 3.93L1.87 3.51ZM20.18 13.99L20.18 14.48L19.90 15.53L19.34 16.72L18.78 17.56L17.94 18.46L17.24 19.02L15.49 19.93L14.38 20.21L12.42 20.21L11.79 20.07L10.18 19.37L9.20 18.46L9 18.11L8.93 17.42L9 17.21L9.41 16.79L11.93 15.60L13.96 14.27L15.21 12.94L15.91 11.69L16.19 10.92L16.40 11.06L17.10 12.31L17.80 13.01L18.57 13.50L19.69 13.85L20.04 13.85ZM16.12 9.73L16.19 10.08L15.77 10.85L15.07 11.48L14.03 12.03L11.16 12.94L8.65 13.57L8.23 13.50L9 12.38L10.60 10.78L12 9.87L14.10 9.17L15.42 9.17L15.77 9.31ZM18.01 5.54L18.29 5.40L18.50 5.54L18.50 5.75L18.36 5.89L18.15 5.89L18.01 5.75Z";

const number = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat();
const dollars = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const control =
  "rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
const muted = "text-xs text-muted-foreground";

function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}
function syncSummary(result: SyncResult) {
  const pi = result.pi.ok
    ? t.piUpdated(result.pi.machines.length, result.pi.refreshed)
    : "error" in result.pi
    ? `Pi: ${result.pi.error}`
    : `Pi: ${result.pi.machines.filter((entry) => !entry.ok).map((entry) => `${entry.machine}: ${entry.error}`).join("; ")}`;
  const native = result.bb.ok
    ? t.pickersUpdated(result.bb.total, result.bb.added, result.bb.removed)
    : `${t.pickers}: ${result.bb.error}`;
  return `${pi} ${native}`;
}
const resetTime = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
function timeLeft(value: string) {
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60_000));
  const { d, h, m } = t.units;
  return minutes >= 1440 ? `${Math.floor(minutes / 1440)}${d} ${Math.floor(minutes % 1440 / 60)}${h}`
    : minutes >= 60 ? `${Math.floor(minutes / 60)}${h} ${minutes % 60}${m}` : `${minutes}${m}`;
}
function resetLabel(value: string) {
  return t.resetsIn(timeLeft(value), resetTime.format(new Date(value)));
}
function Subscriptions({ data }: { data: Monitor }) {
  if (!data.webConfigured) return null;
  if (!data.quotas.ok) return <Notice>{data.quotas.error}</Notice>;
  if (!data.quotas.data.length) return null;
  return (
    <Panel title={t.subscriptions} detail={t.subscriptionsDetail}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.quotas.data.map((account) => (
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
                  <span className="shrink-0 tabular-nums">{t.used(Math.round(window.used))}</span>
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
            {!account.windows.length && !account.balance ? <p className={muted}>{t.noAllowance}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
// Magpie quota providers that match a BB agent provider, for its icon.
const agentProvider: Record<string, string> = { claude: "claude-code", codex: "codex", pi: "pi" };
// "7 days Sonnet" -> "7d Sonnet", to fit the narrow sidebar row.
const windowLabel = (name: string) =>
  name.replace(/^(\d+) (hour|day|week|month)s?\b/, (_, count: string, unit: string) => `${count}${t.windowUnits[unit]}`);
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
        if (alive) setError(t.subscriptionError);
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
    ? t.loadingSubscriptions
    : !data.webConfigured
    ? t.setWebSettings
    : !data.quotas.ok
    ? data.quotas.error
    : !data.quotas.data.length
    ? t.noSubscriptions
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
          aria-label={t.refreshSubscriptions}
          title={t.refresh}
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
                    ? <p className="col-span-full text-muted-foreground">{t.noAllowance}</p>
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
function Panel({ title, detail, action, children }: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {detail ? <p className={`${muted} mt-1`}>{detail}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<[NoInfer<T>, string]>;
  onChange(value: NoInfer<T>): void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2.5 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${
            value === option ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

type Usage = Extract<Monitor["usage"], { ok: true }>["data"];
type Totals = Omit<Usage, "period" | "bucket" | "series" | "agents" | "models">;
const card = "rounded-xl border border-border/70 bg-muted/[0.08]";
// Brand colors for known agents; others take the palette in usage order.
const agentColors: Record<string, string> = { claude: "#D97757", codex: "#10A37F", pi: "#64748B" };
const palette = ["#0EA5E9", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6"];
const tokens = (totals: Totals) => totals.input + totals.output + totals.cache_read + totals.cache_write;
const share = (value: number, total: number) => `${total ? (100 * value / total).toFixed(1) : "0.0"}%`;
const price = (totals: Totals) =>
  totals.unpriced && !totals.cost ? t.unknown : `${dollars.format(totals.cost)}${totals.unpriced ? "+" : ""}`;
// Day buckets start at midnight in the Magpie server time zone; format that calendar date without shifting it.
const dayLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const bucketLabel = (usage: Usage, bucket: { label: string; time: string }) =>
  usage.bucket === "hour" ? `${bucket.label}:00` : dayLabel.format(new Date(`${bucket.time.slice(0, 10)}T00:00:00Z`));

function AgentIcon({ id, className = "size-4" }: { id: string; className?: string }) {
  const providers = experimental_useProviders();
  const bbId = agentProvider[id];
  if (!bbId) return <span className={`${className} shrink-0 rounded-full border border-border`} aria-hidden="true" />;
  const provider = providers.providers.find((entry) => entry.id === bbId);
  return <ProviderIcon providerKind="agent" provider={provider ?? { id: bbId }} className={`${className} shrink-0`} />;
}

// Catmull-Rom curve with control points held between neighbours, so a line never dips below zero.
function linePath(points: Array<[number, number]>) {
  if (!points.length) return "";
  let path = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1] ?? points[i];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[i + 2] ?? points[i + 1];
    const clamp = (y: number) => Math.min(Math.max(y1, y2), Math.max(Math.min(y1, y2), y));
    path += ` C${x1 + (x2 - x0) / 6},${clamp(y1 + (y2 - y0) / 6)} ${x2 - (x3 - x1) / 6},${clamp(y2 - (y3 - y1) / 6)} ${x2},${y2}`;
  }
  return path;
}
function niceMaximum(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find((step) => value <= step * power) ?? 10) * power;
}
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const id = useId();
  const max = Math.max(...values, 0) || 1;
  const points = values.map((value, i): [number, number] => [
    values.length > 1 ? i / (values.length - 1) * 100 : 50,
    30 - value / max * 26,
  ]);
  const line = linePath(points);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-3 h-10 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,32 L0,32 Z`} fill={`url(#${CSS.escape(id)})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function StatCard({ label, value, detail, values, color }: {
  label: string;
  value: string;
  detail: string;
  values: number[];
  color: string;
}) {
  return (
    <div className={`${card} min-w-0 p-4`}>
      <p className={muted}>{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight" title={value}>{value}</p>
      <p className={`${muted} mt-1 truncate`} title={detail}>{detail}</p>
      <Sparkline values={values} color={color} />
    </div>
  );
}

function Overview({ usage, colors }: { usage: Usage; colors: Record<string, string> }) {
  const total = tokens(usage);
  return (
    <div className="space-y-6">
      <div>
        <p className={muted}>{t.estimatedCost}</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
          {dollars.format(usage.cost)}{usage.unpriced ? "*" : ""}
        </p>
        <p className={`${muted} mt-1`}>
          {usage.unpriced
            ? t.unpriced(exact.format(usage.unpriced))
            : t.listPrice}
        </p>
      </div>
      <div className="space-y-4">
        {usage.agents.map((agent) => {
          const value = tokens(agent);
          return (
            <div key={agent.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <AgentIcon id={agent.id} />
                  <span className="truncate">{agent.name}</span>
                </span>
                <span className="shrink-0 tabular-nums">{t.tokenCount(number.format(value))}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${total ? 100 * value / total : 0}%`, backgroundColor: colors[agent.id] }}
                />
              </div>
              <p className={`${muted} tabular-nums`}>
                {t.tokenShare(share(value, total))} · {price(agent)} · {t.requestCount(exact.format(agent.calls))}
              </p>
            </div>
          );
        })}
        {!usage.agents.length ? <p className={muted}>{t.noRequests}</p> : null}
      </div>
    </div>
  );
}

const chartWidth = 600;
const chartHeight = 200;
function TrendChart({ usage, colors }: { usage: Usage; colors: Record<string, string> }) {
  const [metric, setMetric] = useState<"tokens" | "cost">("tokens");
  const [hover, setHover] = useState<number | null>(null);
  const count = usage.series.length;
  const values = (id: string) => usage.series.map((bucket) => bucket.agents[id]?.[metric] ?? 0);
  const agents = usage.agents.filter((agent) => values(agent.id).some(Boolean));
  const max = niceMaximum(Math.max(0, ...agents.flatMap((agent) => values(agent.id))));
  const x = (i: number) => count > 1 ? i / (count - 1) * chartWidth : chartWidth / 2;
  const y = (value: number) => chartHeight - value / max * chartHeight;
  const format = (value: number) => metric === "cost" ? dollars.format(value) : number.format(value);
  const step = Math.max(1, Math.ceil(count / 6));
  const ticks = usage.series.map((_, i) => i).filter((i) => i % step === 0 || i === count - 1)
    .filter((i, index, all) => i === count - 1 || all[index + 1] - i >= step / 2);
  const hovered = hover === null ? null : usage.series[hover];
  return (
    <Panel
      title={metric === "tokens" ? t.tokensOverTime : t.costOverTime}
      detail={t.perBucket(usage.bucket)}
      action={
        <Segmented
          label={t.chartMetric}
          value={metric}
          options={[["tokens", t.tokens], ["cost", t.cost]]}
          onChange={setMetric}
        />
      }
    >
      <div className="relative h-52 pl-12">
        {[1, 0.75, 0.5, 0.25, 0].map((tick) => (
          <span
            key={tick}
            className="absolute left-0 w-10 -translate-y-1/2 text-right text-[11px] tabular-nums text-muted-foreground"
            style={{ top: `${(1 - tick) * 100}%` }}
          >
            {format(max * tick)}
          </span>
        ))}
        <div
          className="relative h-full"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            setHover(count > 1 ? Math.round(fraction * (count - 1)) : 0);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label={t.chartLabel(metric, usage.bucket)}
          >
            <defs>
              {agents.map((agent) => (
                <linearGradient key={agent.id} id={`magpie-area-${agent.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[agent.id]} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={colors[agent.id]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {[1, 0.75, 0.5, 0.25, 0].map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={chartWidth}
                y1={y(max * tick)}
                y2={y(max * tick)}
                stroke="currentColor"
                className="text-border"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {agents.map((agent) => {
              const line = linePath(values(agent.id).map((value, i): [number, number] => [x(i), y(value)]));
              return (
                <g key={agent.id}>
                  <path
                    d={`${line} L${x(count - 1)},${chartHeight} L${x(0)},${chartHeight} Z`}
                    fill={`url(#magpie-area-${agent.id})`}
                  />
                  <path
                    d={line}
                    fill="none"
                    stroke={colors[agent.id]}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
            {hover !== null
              ? (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={0}
                  y2={chartHeight}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  className="text-muted-foreground"
                  vectorEffect="non-scaling-stroke"
                />
              )
              : null}
          </svg>
          {hover !== null && hovered
            ? (
              <div
                className={`pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-border bg-background p-2.5 text-xs shadow-md ${
                  x(hover) > chartWidth / 2 ? "-translate-x-[calc(100%+0.75rem)]" : "translate-x-3"
                }`}
                style={{ left: `${x(hover) / chartWidth * 100}%` }}
              >
                <p className="mb-1.5 font-medium">{bucketLabel(usage, hovered)}</p>
                {agents.map((agent) => (
                  <div key={agent.id} className="flex items-center justify-between gap-4 tabular-nums">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-full" style={{ backgroundColor: colors[agent.id] }} />
                      {agent.name}
                    </span>
                    {format(hovered.agents[agent.id]?.[metric] ?? 0)}
                  </div>
                ))}
              </div>
            )
            : null}
        </div>
      </div>
      <div className="relative ml-12 h-4 text-[11px] text-muted-foreground">
        {ticks.map((i) => (
          <span
            key={i}
            className={`absolute whitespace-nowrap ${
              i === 0 ? "" : i === count - 1 ? "-translate-x-full" : "-translate-x-1/2"
            }`}
            style={{ left: `${x(i) / chartWidth * 100}%` }}
          >
            {bucketLabel(usage, usage.series[i])}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-4 pt-1 text-xs">
        {agents.map((agent) => (
          <span key={agent.id} className="flex items-center gap-1.5">
            <AgentIcon id={agent.id} className="size-3.5" />
            {agent.name}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function Stats({ usage }: { usage: Usage }) {
  const total = tokens(usage);
  const active = usage.series.filter((bucket) => bucket.calls).length || 1;
  const input = usage.input + usage.cache_read + usage.cache_write;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={t.processedTokens}
        value={number.format(total)}
        detail={t.perActive(number.format(total / active), usage.bucket)}
        values={usage.series.map(tokens)}
        color="#0EA5E9"
      />
      <StatCard
        label={t.cachedInput}
        value={number.format(usage.cache_read)}
        detail={t.cacheDetail(share(usage.cache_read, input), number.format(usage.cache_write))}
        values={usage.series.map((bucket) => bucket.cache_read)}
        color="#F59E0B"
      />
      <StatCard
        label={t.output}
        value={number.format(usage.output)}
        detail={t.includesReasoning(number.format(usage.reasoning))}
        values={usage.series.map((bucket) => bucket.output)}
        color="#EC4899"
      />
      <StatCard
        label={t.requests}
        value={number.format(usage.calls)}
        detail={`${t.errorCount(exact.format(usage.errors))} · ${share(usage.errors, usage.calls)}`}
        values={usage.series.map((bucket) => bucket.calls)}
        color="#14B8A6"
      />
    </div>
  );
}

function Breakdown({ usage }: { usage: Usage }) {
  const [view, setView] = useState<"model" | "agent" | "time">("model");
  const total = tokens(usage);
  const rows: Array<Totals & { id: string; name: string; agent?: string }> = view === "model"
    ? [...usage.models].sort((a, b) => tokens(b) - tokens(a))
    : view === "agent"
    ? usage.agents.map((agent) => ({ ...agent, agent: agent.id }))
    : usage.series.filter((bucket) => bucket.calls).reverse()
      .map((bucket) => ({ ...bucket, id: bucket.time, name: bucketLabel(usage, bucket) }));
  const head = "px-4 py-2.5 font-medium";
  return (
    <Panel
      title={t.breakdown}
      action={
        <Segmented
          label={t.breakdownView}
          value={view}
          options={[["model", t.model], ["agent", t.agent], ["time", t.bucket(usage.bucket)]]}
          onChange={setView}
        />
      }
    >
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th scope="col" className={head}>{view === "model" ? t.model : view === "agent" ? t.agent : t.time}</th>
              <th scope="col" className={`${head} text-right`}>{t.requests}</th>
              <th scope="col" className={`${head} text-right`}>{t.tokens}</th>
              <th scope="col" className={`${head} text-right`}>{t.cost}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="tabular-nums">
                <td className="px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    {row.agent ? <AgentIcon id={row.agent} /> : null}
                    <span className="truncate" title={row.name}>{row.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {exact.format(row.calls)}
                  {row.errors ? <p className={muted}>{t.errorCount(exact.format(row.errors))}</p> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {number.format(tokens(row))}
                  <p className={muted}>{t.tokenShare(share(tokens(row), total))}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  {price(row)}
                  <p className={muted}>{t.costShare(share(row.cost, usage.cost))}</p>
                </td>
              </tr>
            ))}
            {!rows.length
              ? (
                <tr>
                  <td colSpan={4} className={`${muted} px-4 py-6 text-center`}>{t.noRequests}</td>
                </tr>
              )
              : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Dashboard() {
  const rpc = useRpc<typeof monitorRpc>();
  const root = useRef<HTMLDivElement>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<Monitor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  async function sync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      setSyncResult(syncSummary(await rpc.call("syncModels", {})));
    } catch (cause) {
      setSyncResult(cause instanceof Error ? cause.message : t.syncFailed);
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
        if (alive) setError(t.refreshFailed);
      } finally {
        inFlight = false;
        if (alive) {
          setLoading(false);
          if (visible && !document.hidden) timer = setTimeout(() => void load(), 15_000);
        }
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      void load();
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
  }, [rpc, period, refresh]);

  const usage = data?.usage.ok && data.usage.data.period === period ? data.usage.data : null;
  const colors = Object.fromEntries(
    (usage?.agents ?? []).map((agent, i) => [agent.id, agentColors[agent.id] ?? palette[i % palette.length]]),
  );
  const providers = data?.providers.ok ? data.providers.data.providers.filter((provider) => !provider.off) : null;
  return (
    <div ref={root} className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 md:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-semibold">
              <MagpieIcon className="size-5" />
              {t.title}
            </h1>
            <p className={`${muted} mt-1 flex items-center gap-1.5`}>
              <span
                className={`size-1.5 rounded-full ${data?.health.ok ? "bg-emerald-500" : "bg-muted-foreground"}`}
                aria-hidden="true"
              />
              {!data
                ? t.connecting
                : data.health.ok
                ? `${t.gateway(data.health.data.version)}${
                  providers ? ` · ${t.providersReady(providers.filter((provider) => provider.ready).length, providers.length)}` : ""
                } · ${t.updated(new Date(data.updatedAt).toLocaleTimeString())}`
                : t.gatewayDown}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label={t.usagePeriod}
              value={period}
              options={[["today", t.today], ["7d", t.days7], ["30d", t.days30]]}
              onChange={setPeriod}
            />
            <button
              type="button"
              className={`${control} px-2`}
              aria-label={t.refresh}
              title={t.refresh}
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              <RefreshIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              className={control}
              disabled={syncing}
              title={t.syncTitle}
              onClick={() => void sync()}
            >
              {syncing ? t.syncing : t.syncModels}
            </button>
            {data?.webLink
              ? (
                <UrlLink href={data.webLink} className={control} title={t.webTitle}>
                  {t.openWeb}
                </UrlLink>
              )
              : null}
          </div>
        </header>
        {syncResult ? <Notice>{syncResult}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {data && !data.health.ok ? <Notice>{data.health.error}</Notice> : null}
        {data && !data.usage.ok ? <Notice>{data.usage.error}</Notice> : null}
        {data && !data.webConfigured
          ? (
            <Notice>{t.webNotice}</Notice>
          )
          : null}
        {usage
          ? (
            <>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Overview usage={usage} colors={colors} />
                <TrendChart usage={usage} colors={colors} />
              </div>
              <Stats usage={usage} />
            </>
          )
          : !data || data.usage.ok
          ? <Notice>{t.loadingUsage}</Notice>
          : null}
        {data ? <Subscriptions data={data} /> : null}
        {usage ? <Breakdown usage={usage} /> : null}
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
    label: t.footerLabel,
    icon: "magpie/logo",
    component: SubscriptionUsage,
  });
});
