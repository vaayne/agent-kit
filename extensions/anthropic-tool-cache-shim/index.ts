import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Keep the scope explicit in code instead of adding runtime env/config plumbing.
const STRIP_TOOL_CACHE_PROVIDERS = new Set(["fireworks"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripToolCacheControl(payload: unknown): { payload: unknown; strippedCount: number } {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) {
    return { payload, strippedCount: 0 };
  }

  let strippedCount = 0;
  const tools = payload.tools.map((tool) => {
    if (!isRecord(tool) || !("cache_control" in tool)) {
      return tool;
    }

    strippedCount += 1;
    const { cache_control: _cacheControl, ...rest } = tool;
    return rest;
  });

  if (strippedCount === 0) {
    return { payload, strippedCount };
  }

  return {
    payload: {
      ...payload,
      tools,
    },
    strippedCount,
  };
}

export default function anthropicToolCacheShim(pi: ExtensionAPI) {
  pi.on("before_provider_request", (event, ctx) => {
    if (!ctx.model) {
      return;
    }

    if (ctx.model.api !== "anthropic-messages") {
      return;
    }

    if (!STRIP_TOOL_CACHE_PROVIDERS.has(ctx.model.provider)) {
      return;
    }

    const { payload, strippedCount } = stripToolCacheControl(event.payload);
    if (strippedCount === 0) {
      return;
    }

    return payload;
  });
}
