import assert from "node:assert/strict";
import { test } from "node:test";
import { type Catalog, catalogSchema, parseMagpieConfig } from "./config.ts";
import { renderExtension } from "./pi-extension.ts";

const secret = "source-secret-never-copy";

// Representative output of magpieProviderJSONAt/piModelJSON, with unsafe
// source fields at each boundary to check the exported metadata contract.
function fixture() {
  return {
    providers: {
      magpie: {
        name: "magpie",
        api: "openai-completions",
        baseUrl: "https://source.invalid/v1",
        apiKey: `!echo ${secret}`,
        headers: { Authorization: secret },
        compat: { sendSessionAffinityHeaders: true, apiKey: secret },
        models: [
          { id: "subscription/chat", name: "Chat", reasoning: false },
          {
            id: "openai/gpt-5.4",
            name: "GPT",
            api: "openai-responses",
            reasoning: true,
            input: ["text", "image"],
            contextWindow: 922000,
            maxTokens: 128000,
            thinkingLevelMap: {
              off: "none",
              minimal: null,
              low: "low",
              medium: "medium",
              high: "high",
              xhigh: "xhigh",
              max: null,
              apiKey: secret,
            },
            promptCache: { short: 300, headers: secret },
            cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0, apiKey: secret },
            apiKey: secret,
            headers: { "x-api-key": secret },
            baseUrl: "https://bypass.invalid",
            samplingParams: { secret },
          },
          {
            id: "anthropic/claude-opus",
            name: "Claude",
            api: "anthropic-messages",
            baseUrl: "https://source.invalid",
            reasoning: true,
            contextWindow: 272000,
            maxTokens: 64000,
            compat: { forceAdaptiveThinking: true, baseUrl: secret },
            thinkingLevelMap: { minimal: null, low: "low", medium: "medium", high: "high" },
            promptCache: { short: 300, long: 3600 },
          },
        ],
      },
      unrelated: { apiKey: secret },
    },
  };
}

function source(model: Record<string, unknown>, provider: Record<string, unknown> = {}) {
  return { providers: { magpie: { ...provider, models: [model] } } };
}

test("Magpie fixture preserves model metadata and merges provider compatibility", () => {
  const input = fixture();
  const original = structuredClone(input);
  const catalog = parseMagpieConfig(input, {
    defaultProvider: "magpie",
    defaultModel: "anthropic/claude-opus",
  });
  assert.deepEqual(input, original);
  assert.equal(catalog.defaultModel, "anthropic/claude-opus");
  assert.deepEqual(catalog.models[0], {
    id: "subscription/chat",
    name: "Chat",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
    compat: { sendSessionAffinityHeaders: true },
  });
  assert.deepEqual(catalog.models[1].thinkingLevelMap, {
    off: "none",
    minimal: null,
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "xhigh",
    max: null,
  });
  assert.deepEqual(catalog.models[1].input, ["text", "image"]);
  assert.deepEqual(catalog.models[1].cost, {
    input: 2.5,
    output: 15,
    cacheRead: 0.25,
    cacheWrite: 0,
  });
  assert.equal(catalog.models[1].contextWindow, 922000);
  assert.equal(catalog.models[1].maxTokens, 128000);
  assert.deepEqual(catalog.models[2].compat, {
    sendSessionAffinityHeaders: true,
    forceAdaptiveThinking: true,
  });
  assert.deepEqual(catalog.models[2].promptCache, { short: 300, long: 3600 });
  assert.equal(Object.hasOwn(catalog.models[2].thinkingLevelMap!, "off"), false);
  assert.doesNotMatch(
    JSON.stringify(catalog),
    /source-secret|source\.invalid|bypass\.invalid|apiKey|headers|baseUrl|samplingParams/,
  );
});

test("model API and compatibility override provider values", () => {
  const catalog = parseMagpieConfig(
    source({
      id: " unchanged /ID ",
      api: "anthropic-messages",
      compat: { sendSessionAffinityHeaders: false },
    }, { api: "openai-responses", compat: { sendSessionAffinityHeaders: true } }),
    {},
  );
  assert.equal(catalog.models[0].id, " unchanged /ID ");
  assert.equal(catalog.models[0].name, " unchanged /ID ");
  assert.equal(catalog.models[0].api, "anthropic-messages");
  assert.deepEqual(catalog.models[0].compat, { sendSessionAffinityHeaders: false });
  assert.equal(
    parseMagpieConfig(
      source({ id: "inherited" }, {
        api: "openai-responses",
      }),
      {},
    ).models[0].api,
    "openai-responses",
  );
});

test("only a matching Magpie setting selects the default model", () => {
  for (
    const settings of [
      undefined,
      null,
      [],
      {},
      { defaultProvider: "other", defaultModel: "openai/gpt-5.4" },
      { defaultProvider: "magpie", defaultModel: "absent" },
      { defaultProvider: "magpie", defaultModel: 42 },
    ]
  ) {
    assert.equal(parseMagpieConfig(fixture(), settings).defaultModel, "subscription/chat");
  }
});

test("invalid boundary data is rejected without source values or error causes", () => {
  const invalidInputs: unknown[] = [
    null,
    {},
    { providers: {} },
    { providers: { magpie: {} } },
    { providers: { magpie: { models: [] } } },
    { providers: { magpie: { models: [{ id: secret }, { id: secret }] } } },
    source({ id: secret, api: secret }),
    source({ id: "ok" }, { api: "google-generative-ai", apiKey: secret }),
    source({ id: "" }),
    source({ id: "a".repeat(1025) }),
    source({ id: "ok", input: ["audio"] }),
    source({ id: "ok", input: ["text", "text"] }),
    source({ id: "ok", compat: { forceAdaptiveThinking: secret } }),
    source({ id: "ok", thinkingLevelMap: { high: 5 } }),
    source({ id: "ok", cost: { input: -1, output: 0, cacheRead: 0, cacheWrite: 0 } }),
    source({ id: "ok", cost: { input: Infinity, output: 0, cacheRead: 0, cacheWrite: 0 } }),
    source({ id: "ok", promptCache: { short: 0 } }),
  ];
  for (const field of ["contextWindow", "maxTokens"]) {
    for (const value of [0, -1, 1.5, Infinity, NaN, "128000", Number.MAX_SAFE_INTEGER + 1]) {
      invalidInputs.push(source({ id: secret, [field]: value }));
    }
  }
  for (const input of invalidInputs) {
    assert.throws(() => parseMagpieConfig(input, {}), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /^Invalid Magpie/);
      assert.doesNotMatch(error.message, /source-secret/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("catalog validates duplicate IDs, size, and membership of default model", () => {
  const catalog = parseMagpieConfig(fixture(), {});
  assert.equal(catalogSchema.safeParse({ ...catalog, defaultModel: "absent" }).success, false);
  assert.equal(catalogSchema.safeParse({ ...catalog, models: [catalog.models[0], catalog.models[0]] }).success, false);
  const many = (count: number, name = "Model") => ({
    providers: { magpie: { models: Array.from({ length: count }, (_, index) => ({ id: `m${index}`, name })) } },
  });
  assert.equal(parseMagpieConfig(many(1024), {}).models.length, 1024);
  assert.throws(() => parseMagpieConfig(many(1025), {}), /Invalid Magpie/);
  assert.throws(() => parseMagpieConfig(many(1024, "x".repeat(1024)), {}), /Invalid Magpie/);
});

type Registration = {
  name: string;
  config: Record<string, unknown> & {
    models: Array<Catalog["models"][number] & { baseUrl: string }>;
  };
};

// Evaluate the actual ESM. The fake API only captures provider registration;
// no model implementation or network dependency is mocked.
async function register(extension: string, env: {
  BB_MAGPIE_BASE_URL?: string;
  BB_MAGPIE_TOKEN?: string;
} = {}) {
  const module = await import(`data:text/javascript;base64,${Buffer.from(extension).toString("base64")}`);
  const previousRoot = process.env.BB_MAGPIE_BASE_URL;
  const previousToken = process.env.BB_MAGPIE_TOKEN;
  delete process.env.BB_MAGPIE_BASE_URL;
  delete process.env.BB_MAGPIE_TOKEN;
  Object.assign(process.env, env);
  const registrations: Registration[] = [];
  try {
    module.default({
      registerProvider(name: string, config: Registration["config"]) {
        registrations.push({ name, config });
      },
    });
  } finally {
    if (previousRoot === undefined) delete process.env.BB_MAGPIE_BASE_URL;
    else process.env.BB_MAGPIE_BASE_URL = previousRoot;
    if (previousToken === undefined) delete process.env.BB_MAGPIE_TOKEN;
    else process.env.BB_MAGPIE_TOKEN = previousToken;
  }
  assert.equal(registrations.length, 1);
  return registrations[0];
}

test("standalone extension exposes the catalog without session environment", async () => {
  const extension = renderExtension(parseMagpieConfig(fixture(), {}));
  assert.doesNotMatch(extension, /\bimport\s|source-secret|source\.invalid|bypass\.invalid/);
  const { name, config } = await register(extension);
  assert.equal(name, "magpie");
  assert.equal(config.name, "Magpie");
  assert.equal(config.api, "openai-completions");
  assert.equal(config.apiKey, "magpie-catalog-placeholder");
  assert.equal(config.baseUrl, "http://127.0.0.1:1/v1");
  assert.deepEqual(config.models.map((model) => model.baseUrl), [
    "http://127.0.0.1:1/v1",
    "http://127.0.0.1:1/v1",
    "http://127.0.0.1:1",
  ]);
  assert.equal(config.headers, undefined);
  assert.equal(config.streamSimple, undefined);
});

test("session environment sets proxy endpoints and literal token", async () => {
  const extension = renderExtension(parseMagpieConfig(fixture(), {}));
  const { config } = await register(extension, {
    BB_MAGPIE_BASE_URL: "https://bb.invalid/plugins/magpie///",
    BB_MAGPIE_TOKEN: "abC012_-proxy",
  });
  assert.equal(config.apiKey, "abC012_-proxy");
  assert.deepEqual(config.models.map((model) => model.baseUrl), [
    "https://bb.invalid/plugins/magpie/v1",
    "https://bb.invalid/plugins/magpie/v1",
    "https://bb.invalid/plugins/magpie",
  ]);
  for (const model of config.models) {
    assert.equal(Object.hasOwn(model, "headers"), false);
    assert.equal(Object.hasOwn(model, "apiKey"), false);
  }
});

test("partial environment and interpreted credentials fail without disclosing values", async () => {
  const extension = renderExtension(parseMagpieConfig(fixture(), {}));
  for (
    const env of [
      { BB_MAGPIE_BASE_URL: "https://bb.invalid" },
      { BB_MAGPIE_TOKEN: "safe" },
      ...["$SECRET", "${SECRET}", `!echo ${secret}`, "abc$SECRET"].map((token) => ({
        BB_MAGPIE_BASE_URL: "https://bb.invalid",
        BB_MAGPIE_TOKEN: token,
      })),
      ...[
        "not-url",
        "file:///tmp/private",
        `https://${secret}@bb.invalid`,
        `https://bb.invalid?token=${secret}`,
        "https://bb.invalid/#fragment",
      ].map((url) => ({
        BB_MAGPIE_BASE_URL: url,
        BB_MAGPIE_TOKEN: "safe",
      })),
    ]
  ) {
    await assert.rejects(register(extension, env), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /source-secret|SECRET/);
      return true;
    });
  }
});

test("JSON source encoding preserves hostile IDs as data and sanitizes direct callers", async () => {
  const id = "\"}; throw new Error(\"INJECTED\"); //\n` ${globalThis.INJECTED = true}";
  const catalog = parseMagpieConfig(source({ id }), {});
  const contaminated = {
    ...catalog,
    models: catalog.models.map((model) => ({
      ...model,
      baseUrl: "https://bypass.invalid",
      headers: { secret },
      apiKey: secret,
    })),
  };
  const extension = renderExtension(contaminated);
  const { config } = await register(extension);
  assert.equal(config.models[0].id, id);
  assert.equal(config.models[0].name, id);
  assert.doesNotMatch(extension, /source-secret|bypass\.invalid/);
  assert.throws(() => renderExtension({ ...catalog, defaultModel: "absent" }), /Invalid Magpie/);
});
