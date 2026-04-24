import type { ExtensionAPI, ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { getModels } from "@mariozechner/pi-ai";

const FIREWORKS_PROVIDER = "fireworks";
const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference";
const FIREWORKS_API_KEY_ENV = "FIREWORKS_API_KEY";
const TARGET_MODEL_ID = "accounts/fireworks/routers/kimi-k2p5-turbo";
const UNSUPPORTED_TOOL_FIELDS = ["cache_control", "eager_input_streaming"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toProviderModelConfig(
  model: ReturnType<typeof getModels<"fireworks">>[number],
): ProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    reasoning: model.reasoning,
    input: [...model.input],
    cost: { ...model.cost },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    headers: model.headers,
    compat: {
      ...(model.compat ?? {}),
      supportsEagerToolInputStreaming: false,
      supportsLongCacheRetention: false,
    },
  };
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

const fireworksModels = getModels("fireworks")
  .filter((model) => model.id === TARGET_MODEL_ID)
  .map(toProviderModelConfig);

export default function fireworkProvider(pi: ExtensionAPI) {
  if (fireworksModels.length !== 1) {
    throw new Error(`Fireworks target model not found: ${TARGET_MODEL_ID}`);
  }

  pi.registerProvider(FIREWORKS_PROVIDER, {
    baseUrl: FIREWORKS_BASE_URL,
    apiKey: FIREWORKS_API_KEY_ENV,
    api: "anthropic-messages",
    models: fireworksModels,
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
