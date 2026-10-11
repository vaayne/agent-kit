import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { parseMagpieConfig } from "./config.ts";
import { hostFiles } from "./host-files.ts";
import { createProxy, machineToken, routes } from "./proxy.ts";

const execAsync = promisify(execFile);
function exec(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number }) {
  const pending = execAsync(command, args, options);
  // Pi reads piped stdin before a print-mode prompt.
  pending.child.stdin?.end();
  return pending;
}
const root = await mkdtemp(join(tmpdir(), "magpie-pi-"));
const servers: Server[] = [];
const calls: Array<{ path: string; model: string; authenticated: boolean }> = [];
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
const catalog = parseMagpieConfig({
  providers: {
    magpie: {
      models: [
        { id: "fixture/chat", api: "openai-completions" },
        { id: "fixture/responses", api: "openai-responses" },
        { id: "fixture/messages", api: "anthropic-messages" },
      ],
    },
  },
}, {});
const signingKey = "local-test-only";
let proxy: ReturnType<typeof createProxy> | undefined;
try {
  const gatewayUrl = await listen(createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (value) => {
      body += value;
    });
    req.on("end", () => {
      const input = JSON.parse(body);
      calls.push({
        path: req.url!,
        model: input.model,
        authenticated: req.headers.authorization === "Bearer fixture-upstream-key",
      });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const event = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      if (req.url === "/v1/messages") {
        event("message_start", {
          type: "message_start",
          message: {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: input.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        });
        event("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        });
        event("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "fixture-ok" },
        });
        event("content_block_stop", { type: "content_block_stop", index: 0 });
        event("message_delta", {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 1 },
        });
        event("message_stop", { type: "message_stop" });
      } else if (req.url === "/v1/responses") {
        const item = {
          id: "msg_test",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "fixture-ok", annotations: [] }],
        };
        event("response.created", {
          type: "response.created",
          response: { id: "resp_test", status: "in_progress", output: [] },
        });
        event("response.output_item.added", {
          type: "response.output_item.added",
          output_index: 0,
          item: { ...item, status: "in_progress", content: [] },
        });
        event("response.content_part.added", {
          type: "response.content_part.added",
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "", annotations: [] },
        });
        event("response.output_text.delta", {
          type: "response.output_text.delta",
          item_id: item.id,
          output_index: 0,
          content_index: 0,
          delta: "fixture-ok",
        });
        event("response.output_item.done", { type: "response.output_item.done", output_index: 0, item });
        event("response.completed", {
          type: "response.completed",
          response: {
            id: "resp_test",
            status: "completed",
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        });
      } else {
        const chunk = (delta: object, finish_reason: string | null) => ({
          id: "chat_test",
          object: "chat.completion.chunk",
          created: 0,
          model: input.model,
          choices: [{ index: 0, delta, finish_reason }],
        });
        res.write(`data: ${JSON.stringify(chunk({ role: "assistant", content: "fixture-ok" }, null))}\n\n`);
        res.write(`data: ${JSON.stringify(chunk({}, "stop"))}\n\ndata: [DONE]\n\n`);
      }
      res.end();
    });
  }));
  proxy = createProxy({
    settings: async () => ({ gatewayUrl, gatewayKey: "fixture-upstream-key", proxySecret: signingKey }),
    enrolled: async (id) => id === "host_fixture",
    onError: (error) => {
      throw error;
    },
  });
  const proxyUrl = await listen(createServer(async (req, res) => {
    const path = new URL(req.url!, "http://127.0.0.1").pathname as typeof routes[number];
    if (!routes.includes(path)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const request = new Request(
      `http://127.0.0.1${path}`,
      {
        method: "POST",
        headers: req.headers as Record<string, string>,
        body: Readable.toWeb(req) as ReadableStream,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
    );
    const response = await proxy!.handle(request, path);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
    else res.end();
  }));
  const agentDir = join(root, "agent");
  await hostFiles(agentDir, join(root, "plugin")).install(catalog);
  const baseEnv: NodeJS.ProcessEnv = { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" };
  delete baseEnv.BB_MAGPIE_BASE_URL;
  delete baseEnv.BB_MAGPIE_TOKEN;
  const command = process.env.PI_TEST_COMMAND || "pi";
  const flags = ["--offline", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes"];
  const version = await exec(command, ["--version"], { cwd: root, env: baseEnv, timeout: 30_000 });
  const list = await exec(command, [...flags, "--list-models", "magpie"], { cwd: root, env: baseEnv, timeout: 30_000 });
  for (const model of catalog.models) {
    assert.ok(list.stdout.includes(model.id), `Catalog omitted ${model.id}: ${list.stdout} ${list.stderr}`);
  }
  assert.equal(calls.length, 0, "Catalog discovery must not contact the gateway.");
  const env = { ...baseEnv, BB_MAGPIE_BASE_URL: proxyUrl, BB_MAGPIE_TOKEN: machineToken(signingKey, "host_fixture") };
  for (const model of catalog.models) {
    const result = await exec(command, [
      ...flags,
      "--no-tools",
      "--no-session",
      "--provider",
      "magpie",
      "--model",
      model.id,
      "--print",
      "Return the fixture text.",
    ], { cwd: root, env, timeout: 30_000 });
    assert.match(result.stdout, /fixture-ok/, `${model.api}: ${result.stdout} ${result.stderr}`);
  }
  assert.deepEqual(calls.map((call) => call.path), ["/v1/chat/completions", "/v1/responses", "/v1/messages"]);
  assert.ok(calls.every((call) => call.authenticated));
  const artifact = {
    at: new Date().toISOString(),
    piVersion: version.stdout.trim(),
    catalogWithoutSessionEnv: "passed",
    protocols: calls,
    productionModelCalls: 0,
  };
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/pi-e2e.json", JSON.stringify(artifact, null, 2) + "\n");
  process.stdout.write(JSON.stringify(artifact, null, 2) + "\n");
} catch (error) {
  process.stderr.write(JSON.stringify({ fixtureCalls: calls }) + "\n");
  throw error;
} finally {
  proxy?.dispose();
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
  await rm(root, { recursive: true, force: true });
}
