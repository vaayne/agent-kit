import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

/**
 * Pi extension for the Fireworks provider.
 *
 * Two jobs:
 * 1. Strip Anthropic tool fields that Fireworks rejects (`cache_control`,
 *    `eager_input_streaming`).
 * 2. Read rate-limit headers from every response and show them in the TUI
 *    status bar.
 *
 * Fireworks rate-limit docs:
 * https://docs.fireworks.ai/serverless/rate-limits
 */

const FIREWORKS_PROVIDER = "fireworks";
const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference";
const FIREWORKS_API_KEY_ENV = "$FIREWORKS_API_KEY";
const UNSUPPORTED_TOOL_FIELDS = ["cache_control", "eager_input_streaming"] as const;
const EXTENSION_ID = "firework-ratelimit";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripUnsupportedToolFields(payload: unknown): {
  payload: unknown;
  strippedFields: number;
} {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) {
    return { payload, strippedFields: 0 };
  }

  let strippedFields = 0;
  const tools = payload.tools.map((tool) => {
    if (!isRecord(tool)) {
      return tool;
    }

    let changed = false;
    const sanitized = { ...tool };
    for (const field of UNSUPPORTED_TOOL_FIELDS) {
      if (field in sanitized) {
        delete sanitized[field];
        strippedFields += 1;
        changed = true;
      }
    }

    return changed ? sanitized : tool;
  });

  if (strippedFields === 0) {
    return { payload, strippedFields };
  }

  return {
    payload: {
      ...payload,
      tools,
    },
    strippedFields,
  };
}

/**
 * Parsed from Fireworks response headers.
 *
 * Header → field mapping:
 *   x-ratelimit-limit-tokens-prompt                  → promptLimit
 *   x-ratelimit-remaining-tokens-prompt                → promptRemaining
 *   x-ratelimit-limit-tokens-cache-adjusted-prompt     → cacheAdjustedLimit
 *   x-ratelimit-remaining-tokens-cache-adjusted-prompt   → cacheAdjustedRemaining
 *   x-ratelimit-limit-tokens-generated                 → generatedLimit
 *   x-ratelimit-remaining-tokens-generated             → generatedRemaining
 *   x-ratelimit-over-limit                             → overLimit
 */
type RateLimitInfo = {
  promptLimit: number | null;
  promptRemaining: number | null;
  cacheAdjustedLimit: number | null;
  cacheAdjustedRemaining: number | null;
  generatedLimit: number | null;
  generatedRemaining: number | null;
  overLimit: boolean;
};

let lastRateLimit: RateLimitInfo | null = null;

function parseHeaderNumber(headers: Record<string, unknown>, key: string): number | null {
  const val = headers[key];
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof val === "number") return val;
  return null;
}

function parseHeaderBoolean(headers: Record<string, unknown>, key: string): boolean {
  const val = headers[key];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true" || val === "1";
  if (typeof val === "number") return val === 1;
  return false;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function parseRateLimitHeaders(headers: Record<string, unknown>): RateLimitInfo {
  return {
    promptLimit: parseHeaderNumber(headers, "x-ratelimit-limit-tokens-prompt"),
    promptRemaining: parseHeaderNumber(headers, "x-ratelimit-remaining-tokens-prompt"),
    cacheAdjustedLimit: parseHeaderNumber(headers, "x-ratelimit-limit-tokens-cache-adjusted-prompt"),
    cacheAdjustedRemaining: parseHeaderNumber(headers, "x-ratelimit-remaining-tokens-cache-adjusted-prompt"),
    generatedLimit: parseHeaderNumber(headers, "x-ratelimit-limit-tokens-generated"),
    generatedRemaining: parseHeaderNumber(headers, "x-ratelimit-remaining-tokens-generated"),
    overLimit: parseHeaderBoolean(headers, "x-ratelimit-over-limit"),
  };
}

function isFireworkProvider(ctx: ExtensionContext): boolean {
  return ctx.model?.provider === FIREWORKS_PROVIDER;
}

/**
 * Builds the status-bar string: "Fireworks In:used/limit (%) Out:... Total:..."
 *
 * Color thresholds (used %):
 *   >= 90 % → error (red)
 *   >= 75 % → warning (yellow)
 *   <  75 % → success (green)
 */
function formatRateLimit(ctx: ExtensionContext, info: RateLimitInfo | null): string | undefined {
  if (!info || !ctx.hasUI) return undefined;

  const theme = ctx.ui.theme;

  if (info.overLimit) {
    return `Fireworks ${theme.fg("error", "OVER LIMIT")}`;
  }

  const promptUsed = info.promptLimit !== null && info.promptRemaining !== null
    ? Math.max(0, info.promptLimit - info.promptRemaining)
    : null;
  const promptUsedPercent = info.promptLimit !== null && info.promptLimit > 0 && promptUsed !== null
    ? Math.round((promptUsed / info.promptLimit) * 100)
    : null;

  const generatedUsed = info.generatedLimit !== null && info.generatedRemaining !== null
    ? Math.max(0, info.generatedLimit - info.generatedRemaining)
    : null;
  const generatedUsedPercent = info.generatedLimit !== null && info.generatedLimit > 0 && generatedUsed !== null
    ? Math.round((generatedUsed / info.generatedLimit) * 100)
    : null;

  const totalUsed = (promptUsed ?? 0) + (generatedUsed ?? 0);
  const totalLimit = (info.promptLimit ?? 0) + (info.generatedLimit ?? 0);
  const totalUsedPercent = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : null;

  const parts: string[] = [];

  if (promptUsed !== null && info.promptLimit !== null && promptUsedPercent !== null) {
    const text = `In:${formatTokens(promptUsed)}/${formatTokens(info.promptLimit)} (${promptUsedPercent}%)`;
    const colored = promptUsedPercent >= 90
      ? theme.fg("error", text)
      : promptUsedPercent >= 75
      ? theme.fg("warning", text)
      : theme.fg("success", text);
    parts.push(colored);
  }

  if (generatedUsed !== null && info.generatedLimit !== null && generatedUsedPercent !== null) {
    const text = `Out:${formatTokens(generatedUsed)}/${formatTokens(info.generatedLimit)} (${generatedUsedPercent}%)`;
    const colored = generatedUsedPercent >= 90
      ? theme.fg("error", text)
      : generatedUsedPercent >= 75
      ? theme.fg("warning", text)
      : theme.fg("success", text);
    parts.push(colored);
  }

  if (totalLimit > 0 && totalUsedPercent !== null) {
    const text = `Total:${formatTokens(totalUsed)}/${formatTokens(totalLimit)} (${totalUsedPercent}%)`;
    const colored = totalUsedPercent >= 90
      ? theme.fg("error", text)
      : totalUsedPercent >= 75
      ? theme.fg("warning", text)
      : theme.fg("success", text);
    parts.push(colored);
  }

  if (parts.length === 0) return undefined;
  return `Fireworks ${parts.join(" ")}`;
}

function updateStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;
  if (!isFireworkProvider(ctx)) {
    ctx.ui.setStatus(EXTENSION_ID, undefined);
    return;
  }
  const status = formatRateLimit(ctx, lastRateLimit);
  ctx.ui.setStatus(EXTENSION_ID, status);
}

export default function fireworkProvider(pi: ExtensionAPI) {
  pi.registerProvider(FIREWORKS_PROVIDER, {
    baseUrl: FIREWORKS_BASE_URL,
    apiKey: FIREWORKS_API_KEY_ENV,
    api: "anthropic-messages",
    models: [
      {
        id: "accounts/fireworks/routers/kimi-k2p6-turbo",
        name: "Kimi K2.6",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0.95, output: 4, cacheRead: 0.16, cacheWrite: 0 },
        contextWindow: 262144,
        maxTokens: 262144,
      },
    ],
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (ctx.model?.provider !== FIREWORKS_PROVIDER || ctx.model.api !== "anthropic-messages") {
      return;
    }

    const { payload, strippedFields } = stripUnsupportedToolFields(event.payload);
    if (strippedFields === 0) {
      return;
    }

    return payload;
  });

  // Capture rate-limit headers from every Fireworks HTTP response.
  pi.on("after_provider_response", (event, ctx) => {
    if (!isFireworkProvider(ctx)) return;
    if (event.status >= 400) return;

    const info = parseRateLimitHeaders(event.headers);
    if (info.promptLimit !== null || info.generatedLimit !== null) {
      lastRateLimit = info;
      updateStatus(ctx);
    }
  });

  pi.on("turn_end", (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("model_select", (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("session_start", (_event, ctx) => {
    updateStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus(EXTENSION_ID, undefined);
    }
    lastRateLimit = null;
  });

  pi.registerCommand("firework-debug", {
    description: "Show Firework extension debug state",
    handler: async (_args, ctx) => {
      const state = {
        modelProvider: ctx.model?.provider,
        modelId: ctx.model?.id,
        modelApi: ctx.model?.api,
        hasUI: ctx.hasUI,
        lastRateLimit,
      };
      ctx.ui.notify(JSON.stringify(state, null, 2), "info");
    },
  });
}
