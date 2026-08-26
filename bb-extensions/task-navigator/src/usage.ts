export interface UsageWindow {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  cost?: {
    usedUsdCents: number;
    limitUsdCents: number;
  };
}

export type UsageProvider =
  | {
    status: "ok";
    planLabel: string | null;
    windows: UsageWindow[];
  }
  | { status: "not_installed" }
  | { status: "unauthenticated" }
  | { status: "expired" }
  | { status: "error"; message: string; planLabel: string | null };

/** Keyed by provider id; bb reports only the providers that can serve usage. */
export type UsageResponse = Record<string, UsageProvider>;

export interface UsageLimitsResult {
  usage: UsageResponse | null;
  fetchedAt: number | null;
  isStale: boolean;
  error: string | null;
}

export interface UsageProviderConfig {
  id: string;
  name: string;
  summaryName: string;
  signInHint: string;
  expiredHint: string;
}

export interface UsageProviderEntry {
  config: UsageProviderConfig;
  usage: UsageProvider;
}

const KNOWN_USAGE_PROVIDERS: Record<
  string,
  { name: string; summaryName: string; signInCommand: string }
> = {
  codex: { name: "Codex", summaryName: "Codex", signInCommand: "codex" },
  "claude-code": {
    name: "Claude Code",
    summaryName: "Claude",
    signInCommand: "claude",
  },
  cursor: {
    name: "Cursor",
    summaryName: "Cursor",
    signInCommand: "cursor-agent login",
  },
};

function titleCaseProviderId(id: string): string {
  const words = id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1));
  return words.length > 0 ? words.join(" ") : id;
}

/** Any provider bridge can report usage, so unknown ids still get usable copy. */
export function usageProviderConfig(id: string): UsageProviderConfig {
  const known = KNOWN_USAGE_PROVIDERS[id];
  const name = known?.name ?? titleCaseProviderId(id);
  const summaryName = known?.summaryName ?? name;
  return {
    id,
    name,
    summaryName,
    signInHint: known
      ? `Run \`${known.signInCommand}\` to sign in and see your usage.`
      : `Sign in to ${name} to see your usage.`,
    expiredHint: known
      ? `Your ${summaryName} session expired. Run \`${known.signInCommand}\`, then refresh usage.`
      : `Your ${name} session expired. Sign in again, then refresh usage.`,
  };
}

export type UsageBarTone = "muted" | "warning" | "destructive";

/** The percentage is consumed subscription capacity, never remaining capacity. */
export function usageBarTone(usedPercent: number): UsageBarTone {
  if (usedPercent >= 95) return "destructive";
  if (usedPercent >= 80) return "warning";
  return "muted";
}

export interface UsageSummaryItem {
  id: string;
  name: string;
  usedPercent: number;
}

export interface UsageSummary {
  items: readonly UsageSummaryItem[];
  hiddenProviderCount: number;
}

/**
 * The compact sidebar has room for one limit per provider. Prefer the window
 * that will reset next, because it is the limit that becomes available first.
 * Missing or malformed reset times retain provider order as a safe fallback.
 */
export function nearestResetUsageWindow(
  windows: readonly UsageWindow[],
  now = Date.now(),
): UsageWindow | null {
  let nearest: UsageWindow | null = null;
  let nearestDelay = Number.POSITIVE_INFINITY;

  for (const window of windows) {
    if (!window.resetsAt) continue;
    const resetAt = new Date(window.resetsAt).getTime();
    if (Number.isNaN(resetAt)) continue;
    const delay = Math.max(0, resetAt - now);
    if (delay < nearestDelay) {
      nearest = window;
      nearestDelay = delay;
    }
  }

  return nearest ?? windows[0] ?? null;
}

/** The sidebar shows only the limit that resets next for each provider. */
export function usageSummary(usage: UsageResponse): UsageSummary {
  const allItems = visibleUsageProviders(usage)
    .flatMap((entry) => {
      const provider = entry.usage;
      if (provider.status !== "ok" || provider.windows.length === 0) return [];
      const window = nearestResetUsageWindow(provider.windows);
      if (!window) return [];
      return [
        {
          id: entry.config.id,
          name: entry.config.summaryName,
          usedPercent: window.usedPercent,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.usedPercent - left.usedPercent
        || left.name.localeCompare(right.name),
    );
  const items = allItems.slice(0, 2);

  return {
    items,
    hiddenProviderCount: allItems.length - items.length,
  };
}

export function formatUsageSummary(summary: UsageSummary): string | null {
  if (summary.items.length === 0) return null;
  const items = summary.items.map(
    (item) => `${item.name} ${item.usedPercent}%`,
  );
  if (summary.hiddenProviderCount > 0) {
    items.push(`+${summary.hiddenProviderCount}`);
  }
  return items.join(" · ");
}

/** Compact, locale-independent reset text keeps sidebar rows one-line friendly. */
export function formatUsageReset(
  resetsAt: string | null,
  now = Date.now(),
): string | null {
  if (!resetsAt) return null;
  const reset = new Date(resetsAt);
  if (Number.isNaN(reset.getTime())) return null;
  const minutes = Math.ceil((reset.getTime() - now) / 60_000);
  if (minutes <= 0) return "Resetting now";
  if (minutes < 60) return `Resets in ${minutes}m`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0
      ? `Resets in ${hours}h ${remainder}m`
      : `Resets in ${hours}h`;
  }
  return `Resets in ${Math.ceil(minutes / (24 * 60))}d`;
}

function formatUsdCents(cents: number, alwaysShowCents: boolean): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  if (!alwaysShowCents && remainder === 0) return `$${dollars}`;
  return `$${dollars}.${String(remainder).padStart(2, "0")}`;
}

/** A cost window replaces percentage text with its provider-reported USD cap. */
export function usageWindowValue(window: UsageWindow): string {
  if (!window.cost) return `${window.usedPercent}% used`;
  return `${formatUsdCents(window.cost.usedUsdCents, true)} / ${formatUsdCents(window.cost.limitUsdCents, false)}`;
}

export type UsageBody =
  | { kind: "windows"; windows: readonly UsageWindow[] }
  | { kind: "message"; text: string }
  | { kind: "none" };

export function visibleUsageProviders(
  usage: UsageResponse,
): readonly UsageProviderEntry[] {
  return Object.entries(usage).flatMap(([id, provider]) =>
    provider.status === "not_installed"
      ? []
      : [{ config: usageProviderConfig(id), usage: provider }]
  );
}

export function describeUsageBody(args: {
  config: UsageProviderConfig;
  usage: UsageProvider | undefined;
  isLoading: boolean;
}): UsageBody {
  const { config, usage, isLoading } = args;
  if (!usage) {
    return {
      kind: "message",
      text: isLoading ? "Loading usage…" : "Usage unavailable.",
    };
  }
  switch (usage.status) {
    case "ok":
      return usage.windows.length > 0
        ? { kind: "windows", windows: usage.windows }
        : { kind: "message", text: "No usage limits reported for this plan." };
    case "not_installed":
      return { kind: "none" };
    case "unauthenticated":
      return { kind: "message", text: config.signInHint };
    case "expired":
      return { kind: "message", text: config.expiredHint };
    case "error":
      return { kind: "message", text: usage.message };
  }
}

export function usagePlanLabel(provider: UsageProvider): string | null {
  return provider.status === "ok" || provider.status === "error"
    ? provider.planLabel
    : null;
}
