import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import { monitorSchema } from "./monitor-contract.ts";
import { createMonitor, type MonitorSettings } from "./monitor.ts";

const totals = {
  calls: 12,
  errors: 2,
  input: 200,
  output: 100,
  cache_read: 500,
  cache_write: 20,
  reasoning: 30,
  cost: 0.42,
  unpriced: 1,
};
// Representative 0.1.1190 payloads. Account names and request content are test data.
const providers = {
  gateway: { running: true, mine: true, lan: true, models: 4, calls: [{ requestBody: "PRIVATE-BODY" }] },
  providers: [{
    id: "example",
    name: "Example",
    ready: true,
    off: false,
    exposed: 4,
    routing: "usage",
    affinity: "",
    headers: { Authorization: "PRIVATE-KEY" },
  }],
};
// Shape of Magpie /v1/magpie/usage/requests, trimmed to one bucket and one request row.
function usage(period: string) {
  const agent = { ...totals, id: "codex", name: "Codex", icon: "codex-color", ttft_ms: 900 };
  return {
    ...totals,
    period,
    bucket: period === "today" ? "hour" : "day",
    series: [{
      ...totals,
      label: "10",
      time: "2026-10-11T10:00:00Z",
      by: {
        agent: { codex: { calls: 12, tokens: 820, cost: 0.42, ttft_ms: 900 } },
        model: {},
        modelAt: {},
        provider: {},
      },
    }, { ...totals, calls: 0, label: "11", time: "2026-10-11T11:00:00Z", by: { agent: null } }],
    by: { agent: [agent], model: [{ ...totals, id: "test", name: "test" }], modelAt: [], provider: [] },
    rows: [{ t: "2026-10-11T10:00:00Z", agent: "codex", session: "PRIVATE-SESSION", req: "PRIVATE-PROMPT" }],
    accounts: [{ id: "PRIVATE-ACCOUNT", providers: ["Codex"] }],
    callerKeys: [{ callerKeyName: "PRIVATE-KEY" }],
    total: 1,
    offset: 0,
  };
}
// Shape of Magpie 0.1.1190 /api/usage/quotas, with account details replaced.
const quotas = [
  {
    provider: "claude",
    name: "Claude Code",
    icon: "claude",
    plan: "max",
    user: "user@example.com",
    windows: [{ name: "5 hours", used: 3, resetsAt: "2026-10-12T12:40:00+08:00" }, { name: "7 days", used: 52 }],
    readAt: "2026-10-12T08:52:27+08:00",
    lastServedAt: "2026-10-12T00:56:44Z",
  },
  {
    provider: "codex",
    name: "Codex",
    plan: "pro",
    windows: [{ name: "7 days", used: 9, resetsAt: "2026-10-18T12:29:06+08:00", resetSecs: 531148 }],
    balance: "62500 credits",
    resets: { count: 3 },
  },
  { provider: "deepseek", name: "DeepSeek", windows: null, balance: "¥3.53 · $0.00", balanceTrend: { points: [] } },
];
async function serve(t: TestContext, handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function fixture(t: TestContext) {
  const requests: string[] = [];
  let failure = "";
  let key = "test-web-key";
  const gatewayUrl = await serve(t, (req, res) => {
    const url = new URL(req.url!, "http://fixture");
    requests.push(url.pathname);
    assert.equal(req.headers.authorization, "Bearer test-gateway-key");
    if (failure.startsWith("usage") && url.pathname.includes("usage")) {
      res.writeHead(failure === "usage-401" ? 401 : 403);
      res.end("PRIVATE-ERROR");
      return;
    }
    const body = url.pathname === "/api/hello"
      ? { name: "magpie", version: "0.1.1190" }
      : usage(url.searchParams.get("period")!);
    if (failure === "time" && "series" in body) body.series[0].time = "Oct 11";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  const webUrl = await serve(t, (req, res) => {
    const url = new URL(req.url!, "http://fixture");
    requests.push(url.pathname);
    if (url.pathname === "/") {
      if (url.searchParams.get("k") !== key) {
        res.writeHead(401);
        res.end("PRIVATE-ERROR");
        return;
      }
      res.writeHead(303, { "set-cookie": `magpie_web_3430=${key}; HttpOnly; Path=/`, location: "/" });
      res.end();
      return;
    }
    assert.equal(req.headers.cookie, `magpie_web_3430=${key}`);
    if (failure === "web-401") {
      res.writeHead(401);
      res.end();
      return;
    }
    const data = url.pathname === "/api/providers"
      ? failure === "schema" ? { providers: [{ ready: "yes", off: false }] } : providers
      : quotas;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(data));
  });
  let config: MonitorSettings = {
    gatewayUrl,
    webUrl,
    gatewayKey: "test-gateway-key",
    webKey: key,
    webLink: "",
  };
  const monitor = createMonitor(async () => config);
  t.after(() => monitor.dispose());
  return {
    monitor,
    requests,
    fail(value: string) {
      failure = value;
    },
    configure(value: Partial<MonitorSettings>) {
      config = { ...config, ...value };
    },
    rotate() {
      key = "rotated-web-key";
      config = { ...config, webKey: key };
    },
  };
}

test("real HTTP login, summary and usage produce a bounded, credential-free snapshot", async (t) => {
  const f = await fixture(t);
  const [data, duplicate] = await Promise.all([f.monitor.get("today"), f.monitor.get("today")]);
  assert.deepEqual(data, duplicate);
  assert.equal(monitorSchema.safeParse(data).success, true);
  assert.equal(f.requests.filter((path) => path === "/").length, 1);
  assert.equal(f.requests.filter((path) => path === "/api/hello").length, 1);
  assert.ok(f.requests.includes("/v1/magpie/usage/requests"));
  assert.ok(data.usage.ok && data.providers.ok);
  assert.equal(data.usage.data.bucket, "hour");
  assert.deepEqual(data.usage.data.agents.map((agent) => [agent.id, agent.name, agent.reasoning]), [[
    "codex",
    "Codex",
    30,
  ]]);
  assert.deepEqual(data.usage.data.series.map((bucket) => bucket.agents), [
    { codex: { tokens: 820, cost: 0.42 } },
    {},
  ]);
  assert.ok(!("rows" in data.usage.data) && !("by" in data.usage.data));
  assert.equal(data.webLink, new URL(data.webLink).origin);
  assert.ok(data.quotas.ok);
  assert.deepEqual(data.quotas.data.map((account) => [account.provider, account.windows.length]), [
    ["claude", 2],
    ["codex", 1],
    ["deepseek", 0],
  ]);
  assert.equal(data.quotas.data[1].balance, "62500 credits");
  assert.ok(!("resetSecs" in data.quotas.data[1].windows[0]) && !("icon" in data.quotas.data[0]));
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE-|test-web-key|test-gateway-key|requestBody|prompt/);
  await f.monitor.get("today");
  assert.equal(f.requests.filter((path) => path === "/api/hello").length, 1);
});

test("a usage access failure preserves gateway and routing results without exposing upstream bodies", async (t) => {
  const f = await fixture(t);
  f.fail("usage");
  const data = await f.monitor.get("7d");
  assert.ok(data.health.ok && data.providers.ok && !data.usage.ok);
  assert.match(data.usage.error, /HTTP 403/);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE-/);
});

test("schema drift is explicit and limited to the affected section", async (t) => {
  const f = await fixture(t);
  f.fail("schema");
  const data = await f.monitor.get("today");
  assert.ok(!data.providers.ok && data.health.ok && data.usage.ok && data.quotas.ok);
  assert.match(data.providers.error, /unsupported data format/);
  f.fail("time");
  const week = await f.monitor.get("7d");
  assert.ok(!week.usage.ok && week.providers.ok);
});

test("a gateway 401 keeps the Web UI session", async (t) => {
  const f = await fixture(t);
  f.fail("usage-401");
  const [today, week] = [await f.monitor.get("today"), await f.monitor.get("7d")];
  assert.ok(!today.usage.ok && !week.usage.ok && today.providers.ok && week.providers.ok);
  assert.equal(f.requests.filter((path) => path === "/").length, 1);
});

test("a Web UI 401 signs in again on the next snapshot", async (t) => {
  const f = await fixture(t);
  f.fail("web-401");
  assert.ok(!(await f.monitor.get("today")).providers.ok);
  f.fail("");
  assert.ok((await f.monitor.get("7d")).providers.ok);
  assert.equal(f.requests.filter((path) => path === "/").length, 2);
});

test("missing or wrong web credentials preserve gateway monitoring; settings changes clear the cache", async (t) => {
  const f = await fixture(t);
  f.configure({ webKey: "" });
  let data = await f.monitor.get("today");
  assert.ok(data.health.ok && data.usage.ok && !data.providers.ok);
  assert.equal(data.webConfigured, false);
  assert.equal(f.requests.includes("/"), false);
  f.configure({ webKey: "wrong-key" });
  data = await f.monitor.get("today");
  assert.ok(!data.providers.ok);
  assert.match(data.providers.error, /HTTP 401/);
  f.rotate();
  data = await f.monitor.get("today");
  assert.ok(data.providers.ok);
  assert.equal(f.requests.filter((path) => path === "/").length, 2);
});

test("periods have separate cached results and disposal stops further reads", async (t) => {
  const f = await fixture(t);
  const [today, week] = await Promise.all([f.monitor.get("today"), f.monitor.get("7d")]);
  assert.ok(today.usage.ok && week.usage.ok);
  assert.equal(today.usage.data.period, "today");
  assert.equal(week.usage.data.period, "7d");
  f.monitor.dispose();
  await assert.rejects(f.monitor.get("today"), /stopping/);
});

test("invalid origins cannot return embedded credentials to the browser", async (t) => {
  const f = await fixture(t);
  f.configure({ gatewayUrl: "http://PRIVATE-KEY@example.test/?key=PRIVATE-QUERY" });
  let data = await f.monitor.get("today");
  assert.ok(!data.health.ok);
  assert.equal(data.webLink, new URL(data.webLink).origin);
  f.configure({ webLink: "https://PRIVATE-USER:PRIVATE-PASS@magpie.example.test/" });
  data = await f.monitor.get("today");
  assert.equal(data.webLink, new URL(data.webLink).origin);
  f.configure({ webLink: "https://magpie.example.test/web" });
  data = await f.monitor.get("today");
  assert.equal(data.webLink, "https://magpie.example.test/web");
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE-/);
});

test("redirects are not followed and cannot send a key to another origin", async (t) => {
  let contacted = false;
  const target = await serve(t, (_req, res) => {
    contacted = true;
    res.end();
  });
  const source = await serve(t, (_req, res) => {
    res.writeHead(302, { location: target });
    res.end();
  });
  const monitor = createMonitor(async () => ({
    gatewayUrl: source,
    gatewayKey: "private",
    webUrl: source,
    webKey: "private",
    webLink: "",
  }));
  t.after(() => monitor.dispose());
  const data = await monitor.get("today");
  assert.ok(!data.health.ok && !data.providers.ok);
  assert.equal(contacted, false);
});
