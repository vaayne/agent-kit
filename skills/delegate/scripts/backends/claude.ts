import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { DelegateEvent, RunOptions } from "../types.ts";

const WORKER_SYSTEM_PROMPT =
  "You are a delegated worker. Return raw findings/results directly; no persona, no meta-commentary about process.";

type ClaudeOptions = Parameters<typeof query>[0]["options"];

function buildOptions(opts: RunOptions, abortController: AbortController): ClaudeOptions {
  const append = [WORKER_SYSTEM_PROMPT, ...opts.system].filter(Boolean).join("\n\n");
  return {
    model: opts.model,
    cwd: opts.cwd,
    resume: opts.session,
    forkSession: opts.fork || undefined,
    persistSession: !opts.noSession,
    tools: opts.tools,
    permissionMode: opts.permissionMode as NonNullable<ClaudeOptions>["permissionMode"],
    allowDangerouslySkipPermissions: opts.permissionMode === "bypassPermissions" ? true : undefined,
    abortController,
    maxTurns: opts.maxTurns,
    effort: opts.effort,
    includePartialMessages: true,
    settingSources: ["project", "local"],
    systemPrompt: { type: "preset", preset: "claude_code", append },
  };
}

function textFromToolResult(block: any): string | undefined {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

function resultError(message: Extract<SDKMessage, { type: "result" }>): string | undefined {
  if (message.subtype === "success") return undefined;
  const details = "errors" in message && message.errors.length > 0 ? `: ${message.errors.join("; ")}` : "";
  return `${message.subtype}${details}`;
}

export async function* run(opts: RunOptions, signal: AbortSignal): AsyncIterable<DelegateEvent> {
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal.reason);
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });

  const toolNames = new Map<string, string>();

  try {
    for await (const message of query({
      prompt: `Task: ${opts.task.trim()}`,
      options: buildOptions(opts, abortController),
    })) {
      if (message.type === "system" && message.subtype === "init") {
        yield { kind: "session", id: message.session_id, ephemeral: opts.noSession };
        continue;
      }

      if (message.type === "system" && message.subtype === "api_retry") {
        yield { kind: "retry", attempt: message.attempt, max: message.max_retries, message: message.error };
        continue;
      }

      if (message.type === "system" && message.subtype === "permission_denied") {
        yield { kind: "tool_error", name: message.tool_name, detail: message.message };
        continue;
      }

      if (message.type === "stream_event") {
        const inner = message.event;
        if (inner.type === "content_block_delta" && inner.delta.type === "text_delta") {
          yield { kind: "text", delta: inner.delta.text };
        }
        continue;
      }

      if (message.type === "assistant") {
        for (const block of message.message.content ?? []) {
          if (block.type === "tool_use") toolNames.set(block.id, block.name);
        }
        continue;
      }

      if (message.type === "user") {
        const content = Array.isArray(message.message.content) ? message.message.content : [message.message.content];
        for (const block of content) {
          if (typeof block === "object" && block && block.type === "tool_result" && block.is_error) {
            yield {
              kind: "tool_error",
              name: toolNames.get(block.tool_use_id) ?? "?",
              detail: textFromToolResult(block),
            };
          }
        }
        continue;
      }

      if (message.type === "result") {
        yield { kind: "cost", usd: message.total_cost_usd, turns: message.num_turns };
        yield { kind: "done", ok: message.subtype === "success", error: resultError(message) };
      }
    }
  } catch (err) {
    if (signal.aborted) yield { kind: "done", ok: false };
    else yield { kind: "done", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
