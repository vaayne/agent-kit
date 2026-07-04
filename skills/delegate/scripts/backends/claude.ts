import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { DelegateEvent, RunOptions } from "../types.ts";

function buildArgs(opts: RunOptions): string[] {
  // Prompt goes first, before any variadic flag. claude's --tools <tools...>
  // greedily consume trailing args, so a prompt positional placed after them gets
  // swallowed (claude then errors with "Input must be provided").
  const out = [
    "-p",
    `Task: ${opts.task.trim()}`,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--permission-mode",
    opts.permissionMode,
  ];
  if (opts.model) out.push("--model", opts.model);
  if (opts.effort) out.push("--effort", opts.effort);
  if (opts.tools) out.push("--tools", ...opts.tools);
  if (opts.session) out.push("--resume", opts.session);
  if (opts.fork) out.push("--fork-session");
  if (opts.noSession) out.push("--no-session-persistence");
  if (opts.maxTurns) out.push("--max-turns", String(opts.maxTurns));
  for (const sys of opts.system) out.push("--append-system-prompt", sys);
  return out;
}

function toolResultText(block: any): string | undefined {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n") || undefined;
}

// Drive `claude -p` in stream-json mode for Phase 1, but expose normalized
// events so delegate.ts owns all stdout/stderr rendering.
export async function* run(opts: RunOptions, signal: AbortSignal): AsyncIterable<DelegateEvent> {
  const child = spawn("claude", buildArgs(opts), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });

  let resultError: string | undefined;
  let stderrTail = "";
  const toolNames = new Map<string, string>();
  const pending: DelegateEvent[] = [];
  let notify: (() => void) | undefined;
  let done = false;
  let spawnError: Error | undefined;

  const push = (event: DelegateEvent) => {
    pending.push(event);
    notify?.();
    notify = undefined;
  };

  const abort = () => {
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 1000).unref();
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });

  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (event.type === "system" && event.subtype === "init") {
      push({ kind: "session", id: event.session_id, ephemeral: opts.noSession });
      return;
    }
    if (event.type === "stream_event") {
      const inner = event.event;
      if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
        push({ kind: "text", delta: inner.delta.text });
      }
      return;
    }
    if (event.type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") toolNames.set(block.id, block.name);
      }
      return;
    }
    if (event.type === "user") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_result" && block.is_error) {
          push({
            kind: "tool_error",
            name: toolNames.get(block.tool_use_id) ?? "?",
            detail: toolResultText(block),
          });
        }
      }
      return;
    }
    if (event.type === "result") {
      if (event.is_error) resultError = event.result || event.subtype || "unknown error";
      if (typeof event.total_cost_usd === "number") {
        push({ kind: "cost", usd: event.total_cost_usd, turns: event.num_turns });
      }
    }
  });

  child.on("error", (err) => {
    spawnError = err;
  });
  child.on("close", (code) => {
    if (spawnError) push({ kind: "done", ok: false, error: `failed to spawn claude: ${spawnError.message}` });
    else if (signal.aborted) push({ kind: "done", ok: false });
    else if (resultError) push({ kind: "done", ok: false, error: resultError });
    else if (code !== 0) {
      const detail = stderrTail.trim() ? `${stderrTail.trim()}\n` : "";
      push({ kind: "done", ok: false, error: `${detail}claude exited with code ${code}` });
    } else {
      push({ kind: "done", ok: true });
    }
    done = true;
    notify?.();
    notify = undefined;
  });

  while (!done || pending.length > 0) {
    if (pending.length === 0) await new Promise<void>((resolve) => (notify = resolve));
    while (pending.length > 0) yield pending.shift()!;
  }
}
