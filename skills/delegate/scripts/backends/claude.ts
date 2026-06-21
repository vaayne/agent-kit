import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { RunOptions } from "../types.ts";

function buildArgs(opts: RunOptions): string[] {
  // Prompt goes first, before any variadic flag. claude's --tools <tools...>
  // and --add-dir <dirs...> greedily consume trailing args, so a prompt
  // positional placed after them gets swallowed (claude then errors with
  // "Input must be provided"). Anchoring it right after -p keeps it safe.
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
  for (const sys of opts.system) out.push("--append-system-prompt", sys);
  out.push(...opts.passthrough); // user escape hatch, verbatim
  return out;
}

// Drive `claude -p` in stream-json mode: assistant text to stdout, session/tool
// status to stderr. Resolves with the child exit code.
export function run(opts: RunOptions): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("claude", buildArgs(opts), { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });

    let sessionReported = false;
    let wroteText = false;
    let resultError: string | undefined;
    let stderrTail = "";
    const toolNames = new Map<string, string>(); // tool_use_id -> name, to label failures

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
        if (!sessionReported) {
          sessionReported = true;
          console.error(`[${opts.noSession ? "session:ephemeral" : "session"}] ${event.session_id}`);
        }
        return;
      }
      if (event.type === "stream_event") {
        const inner = event.event;
        if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
          wroteText = true;
          process.stdout.write(inner.delta.text);
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
        // Stay quiet on success; only surface tool failures, with the tool name.
        for (const block of event.message?.content ?? []) {
          if (block.type === "tool_result" && block.is_error) {
            console.error(`[tool:error] ${toolNames.get(block.tool_use_id) ?? "?"}`);
          }
        }
        return;
      }
      if (event.type === "result") {
        if (event.is_error) resultError = event.result || event.subtype || "unknown error";
        if (typeof event.total_cost_usd === "number") {
          console.error(`[cost] $${event.total_cost_usd.toFixed(4)} | turns: ${event.num_turns ?? "?"}`);
        }
      }
    });

    child.on("error", (err) => {
      console.error(`[error] failed to spawn claude: ${err.message}`);
      resolve(1);
    });
    child.on("close", (code) => {
      if (wroteText) process.stdout.write("\n");
      if (resultError) console.error(`[error] ${resultError}`);
      if (code !== 0 && !resultError) {
        if (stderrTail.trim()) console.error(stderrTail.trim());
        console.error(`[error] claude exited with code ${code}`);
      }
      resolve(code ?? 0);
    });
  });
}
