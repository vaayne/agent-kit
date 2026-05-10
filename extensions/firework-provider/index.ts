import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
const FIREWORKS_PROVIDER = "fireworks";
const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference";
const FIREWORKS_API_KEY_ENV = "FIREWORKS_API_KEY";
const UNSUPPORTED_TOOL_FIELDS = ["cache_control", "eager_input_streaming"] as const;

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
}
