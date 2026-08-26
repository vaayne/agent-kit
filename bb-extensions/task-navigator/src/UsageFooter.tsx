import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { taskNavigatorRpc } from "./server.js";
import {
  describeUsageBody,
  formatUsageReset,
  type UsageLimitsResult,
  type UsageProvider,
  type UsageProviderConfig,
  usageBarTone,
  usagePlanLabel,
  usageSummary,
  type UsageWindow,
  usageWindowValue,
  visibleUsageProviders,
} from "./usage.js";

/**
 * One quiet line pinned under the task list: "Claude 42% · Codex 10%". Click
 * to expand the per-window detail; it never competes with the task groups.
 */
export function UsageFooter() {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const [result, setResult] = useState<UsageLimitsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const refresh = useCallback(async (force: boolean) => {
    setLoading(true);
    try {
      setResult(await rpc.call("usageLimits", { force }));
    } catch (cause) {
      setResult({
        usage: null,
        fetchedAt: null,
        isStale: false,
        error: cause instanceof Error && cause.message ? cause.message : "Could not load usage.",
      });
    } finally {
      setLoading(false);
    }
  }, [rpc]);
  useEffect(() => {
    void refresh(false);
    const onFocus = () => void refresh(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const usage = result?.usage ?? null;
  const summary = useMemo(() => (usage ? usageSummary(usage) : null), [usage]);

  return (
    <section aria-label="Usage" className="shrink-0 border-t border-sidebar-border px-1.5 pb-1 pt-1">
      <div className="flex min-h-6 items-center gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-2xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-expanded={expanded}
          title="Usage data is from BB primary machine"
          onClick={() => setExpanded((value) => !value)}
        >
          {summary !== null && summary.items.length > 0
            ? summary.items.map((item, index) => (
              <span key={item.id} className="whitespace-nowrap">
                {index > 0 ? <span className="mx-0.5">·</span> : null}
                <span className={toneTextClass(item.usedPercent)}>{item.name} {item.usedPercent}%</span>
              </span>
            ))
            : <span>{loading ? "Usage…" : "Usage unavailable"}</span>}
          {summary !== null && summary.hiddenProviderCount > 0 ? <span>· +{summary.hiddenProviderCount}</span> : null}
          {result?.isStale ? <span>· stale</span> : null}
        </button>
        <button
          type="button"
          disabled={loading}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground disabled:opacity-50"
          aria-label={loading ? "Refreshing usage data" : "Refresh usage data"}
          title="Refresh usage"
          onClick={() => void refresh(true)}
        >
          <span aria-hidden="true" className={loading ? "animate-spin" : ""}>↻</span>
        </button>
      </div>
      {expanded
        ? (
          <div className="space-y-2 px-1 py-1">
            {usage === null
              ? <p className="text-2xs text-muted-foreground">{result?.error ?? "Usage unavailable."}</p>
              : visibleUsageProviders(usage).map((entry) => (
                <ProviderBlock key={entry.config.id} config={entry.config} usage={entry.usage} />
              ))}
            {usage !== null && result?.error ? <p className="text-2xs text-muted-foreground">{result.error}</p> : null}
          </div>
        )
        : null}
    </section>
  );
}

function ProviderBlock({ config, usage }: { config: UsageProviderConfig; usage: UsageProvider }) {
  const body = describeUsageBody({ config, usage, isLoading: false });
  const planLabel = usagePlanLabel(usage);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xs font-medium text-sidebar-foreground">{config.name}</span>
        {planLabel ? <span className="truncate text-2xs text-muted-foreground">{planLabel}</span> : null}
      </div>
      {body.kind === "windows"
        ? body.windows.map((window) => <WindowRow key={window.label} window={window} />)
        : body.kind === "message"
        ? <p className="text-2xs text-muted-foreground">{body.text}</p>
        : null}
    </div>
  );
}

function WindowRow({ window }: { window: UsageWindow }) {
  const reset = formatUsageReset(window.resetsAt);
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="min-w-0 truncate text-sidebar-foreground">{window.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{usageWindowValue(window)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-sidebar-accent">
        <div className={`h-full rounded-full ${toneBarClass(window.usedPercent)}`} style={{ width: `${window.usedPercent}%` }} />
      </div>
      {reset ? <p className="text-2xs text-muted-foreground">{reset}</p> : null}
    </div>
  );
}

function toneBarClass(usedPercent: number): string {
  switch (usageBarTone(usedPercent)) {
    case "warning": return "bg-warning";
    case "destructive": return "bg-destructive";
    case "muted": return "bg-muted-foreground";
  }
}

function toneTextClass(usedPercent: number): string {
  switch (usageBarTone(usedPercent)) {
    case "warning": return "text-warning";
    case "destructive": return "text-destructive";
    case "muted": return "";
  }
}
