import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test, type TestContext } from "node:test";
import { gunzipSync, gzipSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { createProxy, gatewayFailure, gatewayURL, machineToken, routes, tokenHost } from "./proxy.ts";

const secret = "test-only-signing-key";
const token = machineToken(secret, "host_test");

test("response timeouts remain distinct from connection failures", async () => {
  for (const code of ["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]) {
    const error = new TypeError("fetch failed", { cause: Object.assign(new Error("transport failed"), { code }) });
    const response = gatewayFailure(error);
    assert.equal(response.status, code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" ? 504 : 502);
    assert.match((await response.json()).error.message, response.status === 504 ? /Timed out/ : /Cannot reach/);
  }
});

async function gateway(t: TestContext, handler: (request: IncomingMessage, response: ServerResponse) => void) {
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

function request(headers: Record<string, string> = {}, signal?: AbortSignal) {
  return new Request("http://bb.invalid/v1/messages?discard=1", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, ...headers },
    body: "{\"model\":\"group/test\",\"stream\":true}",
    signal,
  });
}

test("tokens are bound to a machine and gateway URLs cannot carry credentials", () => {
  assert.equal(tokenHost(secret, token), "host_test");
  assert.equal(tokenHost("wrong", token), null);
  assert.equal(tokenHost(secret, token.replace("host_test", "host_other")), null);
  for (const value of ["file:///etc/passwd", "https://key@host", "https://host/v1", "https://host?key=secret"]) {
    assert.throws(() => gatewayURL(value));
  }
});

test("all API paths preserve bytes and protocol headers, while replacing credentials", async (t) => {
  const seen: Array<{ path: string; body: string; headers: IncomingMessage["headers"] }> = [];
  const url = await gateway(t, (req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      seen.push({ path: req.url!, body, headers: req.headers });
      res.writeHead(200, { "content-type": "text/event-stream", "set-cookie": "never-forward=1" });
      res.end("data: {\"text\":\"你好\"}\n\ndata: [DONE]\n\n");
    });
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "upstream-only", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  for (const path of routes) {
    const response = await proxy.handle(
      request({
        "x-api-key": "client-secret",
        cookie: "session=private",
        "x-forwarded-for": "10.0.0.1",
        "x-bb-machine-token": "machine-secret",
        "anthropic-version": "2023-06-01",
        session_id: "test-session",
        "x-session-affinity": "pi-session",
      }),
      path,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await response.text(), "data: {\"text\":\"你好\"}\n\ndata: [DONE]\n\n");
  }
  assert.deepEqual(seen.map((entry) => entry.path), [...routes]);
  for (const entry of seen) {
    assert.equal(entry.body, "{\"model\":\"group/test\",\"stream\":true}");
    assert.equal(entry.headers.authorization, "Bearer upstream-only");
    assert.equal(entry.headers["x-api-key"], "upstream-only");
    assert.equal(entry.headers["anthropic-version"], "2023-06-01");
    assert.equal(entry.headers.session_id, "test-session");
    assert.equal(entry.headers["x-session-affinity"], "pi-session");
    for (const name of ["cookie", "x-forwarded-for", "x-bb-machine-token"]) {
      assert.equal(entry.headers[name], undefined);
    }
  }
});

test("invalid or revoked machine tokens never reach the gateway", async (t) => {
  let hits = 0;
  const url = await gateway(t, (_, res) => {
    hits++;
    res.end();
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => false,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  for (const value of ["bad-token", token]) {
    assert.equal((await proxy.handle(request({ authorization: `Bearer ${value}` }), "/v1/messages")).status, 401);
  }
  assert.equal(hits, 0);
});

test("native compressed request bodies retain their encoding and bytes", async (t) => {
  const payload = JSON.stringify({
    model: "test/model",
    messages: [{ role: "user", content: "test ".repeat(30_000) }],
  });
  const received: string[] = [];
  const url = await gateway(t, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const encoding = req.headers["content-encoding"];
      const body = Buffer.concat(chunks);
      received.push((encoding === "zstd" ? zstdDecompressSync(body) : gunzipSync(body)).toString());
      res.end("{}");
    });
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  for (const encoding of ["gzip", "zstd"]) {
    const body = encoding === "zstd" ? zstdCompressSync(payload) : gzipSync(payload);
    const response = await proxy.handle(
      new Request("http://bb.invalid/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-encoding": encoding },
        body,
      }),
      "/v1/responses",
      "codex",
    );
    assert.equal(response.status, 200);
    await response.text();
  }
  assert.deepEqual(received, [payload, payload]);
});

test("native Codex token header takes precedence over its own login credential", async (t) => {
  const seen: IncomingMessage["headers"][] = [];
  const url = await gateway(t, (req, res) => {
    seen.push(req.headers);
    req.resume();
    res.end("{}");
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  await (await proxy.handle(
    request({ authorization: "Bearer original-codex-login", "x-bb-account-pool-token": token }),
    "/v1/responses",
    "codex",
  )).text();
  await (await proxy.handle(request(), "/v1/messages", "claude")).text();
  assert.equal(seen[0].authorization, "Bearer magpie-codex");
  assert.equal(seen[0]["user-agent"], "codex/bb-magpie");
  assert.equal(seen[0]["x-bb-account-pool-token"], undefined);
  assert.equal(seen[1].authorization, "Bearer magpie-claude");
  assert.equal(seen[1]["user-agent"], "claude/bb-magpie");
});

test("stream data arrives before completion and reader cancellation closes upstream", async (t) => {
  let closed!: () => void;
  const close = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const url = await gateway(t, (_, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: first\n\n");
    res.on("close", closed);
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  const response = await proxy.handle(request(), "/v1/responses");
  const reader = response.body!.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  await reader.cancel();
  await close;
});

test("caller abort and plugin disposal terminate active upstream streams", async (t) => {
  for (const reason of ["caller", "dispose"]) {
    await t.test(reason, async (t) => {
      let closed!: () => void;
      const close = new Promise<void>((resolve) => {
        closed = resolve;
      });
      const url = await gateway(t, (_, res) => {
        res.write("first");
        res.on("close", closed);
      });
      const proxy = createProxy({
        settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
        enrolled: async () => true,
        onError: (error) => {
          throw error;
        },
      });
      t.after(() => proxy.dispose());
      const controller = new AbortController();
      const response = await proxy.handle(request({}, controller.signal), "/v1/messages");
      const reader = response.body!.getReader();
      await reader.read();
      if (reason === "caller") controller.abort();
      else proxy.dispose();
      await assert.rejects(reader.read());
      await close;
    });
  }
});

test("caller abort and disposal close upstream while waiting for headers", { timeout: 5000 }, async (t) => {
  for (const reason of ["caller", "dispose"]) {
    await t.test(reason, async (t) => {
      let accept!: () => void;
      let close!: () => void;
      const accepted = new Promise<void>((resolve) => { accept = resolve; });
      const closed = new Promise<void>((resolve) => { close = resolve; });
      const url = await gateway(t, (req, res) => {
        req.resume();
        res.on("close", close);
        accept();
      });
      const errors: unknown[] = [];
      const proxy = createProxy({
        settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
        enrolled: async () => true,
        onError: (error) => errors.push(error),
      });
      t.after(() => proxy.dispose());
      const controller = new AbortController();
      const response = proxy.handle(request({}, controller.signal), "/v1/responses", "codex");
      await accepted;
      if (reason === "caller") controller.abort();
      else proxy.dispose();
      assert.equal((await response).status, reason === "caller" ? 499 : 503);
      await closed;
      assert.deepEqual(errors, []);
    });
  }
});

test("a non-streaming response can wait 75 seconds for headers", {
  skip: process.env.MAGPIE_LONG_REQUEST_TEST !== "1",
  timeout: 90_000,
}, async (t) => {
  const url = await gateway(t, (req, res) => {
    req.resume();
    const timer = setTimeout(() => res.end(JSON.stringify({ model: "test/long", output: [] })), 75_000);
    res.on("close", () => clearTimeout(timer));
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => { throw error; },
  });
  t.after(() => proxy.dispose());
  const started = performance.now();
  const response = await proxy.handle(new Request("http://bb.invalid/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: "test/long", stream: false }),
  }), "/v1/responses", "codex");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { model: "test/long", output: [] });
  assert.ok(performance.now() - started >= 75_000);
});

test("upstream status and retry delay survive, and redirects never carry the gateway key elsewhere", async (t) => {
  let hits = 0;
  const other = await gateway(t, (_, res) => {
    hits++;
    res.end();
  });
  const url = await gateway(t, (req, res) => {
    if (req.url === "/v1/responses") res.writeHead(307, { location: other });
    else res.writeHead(429, { "retry-after": "20", "content-type": "application/json" });
    res.end("{\"error\":{\"message\":\"quota\"}}");
  });
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "upstream-only", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      throw error;
    },
  });
  t.after(() => proxy.dispose());
  const limited = await proxy.handle(request(), "/v1/messages");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "20");
  assert.deepEqual(await limited.json(), { error: { message: "quota" } });
  const redirected = await proxy.handle(request(), "/v1/responses");
  assert.equal(redirected.status, 307);
  await redirected.text();
  assert.equal(hits, 0);
});

test("a gateway authentication failure stays HTTP 401 instead of becoming a transport error", async (t) => {
  const url = await gateway(t, (req, res) => {
    req.resume();
    res.writeHead(401, { "content-type": "application/json" });
    res.end("{\"error\":{\"message\":\"upstream login expired\"}}");
  });
  const errors: unknown[] = [];
  const proxy = createProxy({
    settings: async () => ({ gatewayUrl: url, gatewayKey: "", proxySecret: secret }),
    enrolled: async () => true,
    onError: (error) => {
      errors.push(error);
    },
  });
  t.after(() => proxy.dispose());
  const response = await proxy.handle(request(), "/v1/messages", "claude");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { message: "upstream login expired" } });
  assert.equal(errors.length, 0);
});
