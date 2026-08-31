import { definePluginApp } from "@get-bb/plugin-sdk/app";
// @ts-expect-error -- CSS side-effect import handled by the bb app build
import "./app.css";

/**
 * Anchors a token-usage badge under the assistant message the plugin's
 * backend resolved as carrying the latest usage report. All data comes from
 * the plugin's rpc, which reads the thread's latest usage events live —
 * nothing is persisted here, mirroring bb's own prune-to-latest semantics.
 */

const PLUGIN_ID = "message-usage";
const BADGE_CLASS = "message-usage-badge";
const ROW_SELECTOR = "[data-timeline-row-id]";
const COLUMN_SELECTOR = "[data-message-column=\"\"]";

interface TokenBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

interface UsageReport {
  last: TokenBreakdown | null;
  total: TokenBreakdown | null;
  outputTokensPerSecond: number | null;
  model: string | null;
  estimatedCostUsd: number | null;
  costIsEstimate: boolean;
  messageRowId: string | null;
}

interface RpcEnvelope {
  ok?: boolean;
  result?: UsageReport;
}

async function callRpc(threadId: string): Promise<UsageReport | null> {
  try {
    const response = await fetch(
      `/api/v1/plugins/${encodeURIComponent(PLUGIN_ID)}/rpc/getUsage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId }),
      },
    );
    const body = (await response.json().catch(() => null)) as RpcEnvelope | null;
    if (!response.ok || !body?.ok || !body.result) return null;
    return body.result;
  } catch {
    return null;
  }
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function formatCost(usd: number | null, isEstimate: boolean): string | null {
  if (usd === null) return null;
  const text = usd >= 0.1
    ? `$${usd.toFixed(2)}`
    : usd >= 0.01
    ? `$${usd.toFixed(3)}`
    : `$${usd.toFixed(4)}`;
  return isEstimate ? `~${text}` : text;
}

/** Shorten "vendor/model-name@variant" ids to the bare model name. */
function formatModel(model: string | null): string | null {
  if (!model) return null;
  const withoutVendor = model.split("/").pop() ?? model;
  const name = withoutVendor.split("@")[0] ?? withoutVendor;
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
}

function buildBadgeText(report: UsageReport): string {
  const parts: string[] = [];
  const model = formatModel(report.model);
  if (model) parts.push(model);
  if (report.last) {
    const { inputTokens, cachedInputTokens, outputTokens } = report.last;
    const totalInput = freshPlusCached(inputTokens, cachedInputTokens);
    parts.push(`↑${formatTokens(totalInput)}`);
    if (cachedInputTokens > 0 && totalInput > 0) {
      const cachePct = Math.round((cachedInputTokens / totalInput) * 100);
      parts.push(`cache ${cachePct}%`);
    }
    parts.push(`↓${formatTokens(outputTokens)}`);
    if (report.outputTokensPerSecond !== null) {
      parts.push(`${report.outputTokensPerSecond} tok/s`);
    }
  }
  const cost = formatCost(report.estimatedCostUsd, report.costIsEstimate);
  if (cost) parts.push(cost);
  if (report.total) parts.push(`Σ${formatTokens(report.total.totalTokens)}`);
  return parts.join(" · ");
}

function freshPlusCached(inputTokens: number, cached: number): number {
  // bb reports inputTokens excluding cached ones for codex but including for
  // claude-code; taking max(fresh, 0) keeps the display sane for both.
  return Math.max(0, inputTokens - cached) + cached;
}

function buildBadge(report: UsageReport): HTMLElement {
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  badge.setAttribute("data-message-usage-badge", "");
  badge.textContent = buildBadgeText(report);
  badge.title = report.last
    ? [
      `input ${report.last.inputTokens} (cached ${report.last.cachedInputTokens})`,
      `output ${report.last.outputTokens} (reasoning ${report.last.reasoningOutputTokens})`,
      `thread total ${report.total?.totalTokens ?? "?"} tokens`,
    ].join("\n")
    : "No usage reported yet";
  return badge;
}

/** Thread view routes: `/threads/:id/*` and `/projects/:pid/threads/:id/*` (BrowserRouter, real paths). */
function extractThreadId(location: { pathname: string; hash: string }): string | null {
  // Prefer the real path; older builds served a hash router, so keep the
  // hash fallback for compatibility.
  const candidates = [location.pathname, location.hash.startsWith("#") ? location.hash.slice(1) : location.hash];
  for (const path of candidates) {
    const projectless = path.match(/^\/threads\/(thr_[A-Za-z0-9]+)/);
    if (projectless) return projectless[1]!;
    const project = path.match(/^\/projects\/[^/]+\/threads\/(thr_[A-Za-z0-9]+)/);
    if (project) return project[1]!;
  }
  return null;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "message-usage-badge",
    mount({ signal }) {
      let badge: HTMLElement | null = null;
      let badgeRowId: string | null = null;
      let inFlight = false;
      let lastScheduledAt = 0;

      const removeBadge = () => {
        badge?.remove();
        badge = null;
        badgeRowId = null;
      };

      const apply = (report: UsageReport) => {
        const rowId = report.messageRowId;
        if (!rowId) {
          removeBadge();
          return;
        }
        const host = document.querySelector<HTMLElement>(
          // Row ids contain "|" and ":" which are safe inside a quoted
          // attribute selector; only quotes/backslashes would need escaping.
          `[data-timeline-row-id="${rowId.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"] ${COLUMN_SELECTOR}`,
        );
        if (!host) {
          // Row not mounted (virtualized away) — badge travels with the row,
          // so it will re-appear on the next refresh when it is visible.
          removeBadge();
          return;
        }
        if (badge && badgeRowId === rowId) {
          const next = buildBadge(report);
          if (badge.textContent !== next.textContent) {
            badge.replaceWith(next);
            badge = next;
          }
          return;
        }
        removeBadge();
        badge = buildBadge(report);
        badgeRowId = rowId;
        host.appendChild(badge);
      };

      const refresh = async () => {
        if (inFlight) return;
        const threadId = extractThreadId(window.location);
        if (!threadId) {
          removeBadge();
          return;
        }
        inFlight = true;
        try {
          const report = await callRpc(threadId);
          if (signal.aborted) return;
          if (!report) {
            removeBadge();
            return;
          }
          apply(report);
        } finally {
          inFlight = false;
        }
      };

      // DOM churn from streaming should not trigger an RPC per mutation;
      // coalesce to one refresh per 800ms window (plus the slow poll below).
      const schedule = () => {
        const now = Date.now();
        if (now - lastScheduledAt < 800) return;
        lastScheduledAt = now;
        window.setTimeout(() => void refresh(), 50);
      };

      const observer = new MutationObserver((mutations) => {
        // Ignore mutations our own badge causes, or the loop feeds itself.
        const external = mutations.some(
          (mutation) =>
            !(mutation.target instanceof HTMLElement)
            || mutation.target.closest(`[data-message-usage-badge]`) === null,
        );
        if (external) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timer = window.setInterval(() => void refresh(), 2000);
      // React Router navigations replace the path without a document-level
      // childList mutation, so poll the route too.
      let lastPath = window.location.pathname;
      const routeTimer = window.setInterval(() => {
        if (window.location.pathname !== lastPath) {
          lastPath = window.location.pathname;
          removeBadge();
          void refresh();
          return;
        }
      }, 300);
      void refresh();

      const cleanup = () => {
        observer.disconnect();
        window.clearInterval(timer);
        window.clearInterval(routeTimer);
        removeBadge();
      };
      signal.addEventListener("abort", cleanup, { once: true });
      return cleanup;
    },
  });
});
