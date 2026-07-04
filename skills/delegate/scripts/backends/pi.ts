import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { DelegateEvent, Effort, RunOptions } from "../types.ts";

type Thinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const WORKER_SYSTEM_PROMPT =
  "You are a delegated worker. Return raw findings/results directly; no persona, no meta-commentary about process.";

// Claude's effort scale tops out at `max`; Pi's at `xhigh`. The rest line up.
function toThinking(effort?: Effort): Thinking | undefined {
  if (!effort) return undefined;
  return effort === "max" ? "xhigh" : effort;
}

async function importPiSdk(): Promise<any> {
  const explicitEntry = process.env.PI_SDK_ENTRY;
  if (explicitEntry) return await import(pathToFileURL(explicitEntry).href);

  // Scripts in skills are often outside a Node package; prefer the globally
  // installed Pi SDK over letting the runtime auto-install a mismatched copy.
  const npmRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf-8" }).stdout.trim();
  if (npmRoot) {
    const entry = join(npmRoot, "@earendil-works", "pi-coding-agent", "dist", "index.js");
    if (existsSync(entry)) return await import(pathToFileURL(entry).href);
  }
  return await import("@earendil-works/pi-coding-agent");
}

function splitModel(value: string): { provider: string; id: string; thinking?: Thinking } {
  const m = value.match(/^(.*):(off|minimal|low|medium|high|xhigh)$/);
  const model = m ? m[1] : value;
  const slash = model.indexOf("/");
  if (slash === -1) throw new Error("Pi model must be provider/model");
  return { provider: model.slice(0, slash), id: model.slice(slash + 1), thinking: m?.[2] as Thinking | undefined };
}

async function findSessionPath(SessionManager: any, cwd: string, session: string): Promise<string> {
  if (existsSync(session)) return session;
  const sessions = await SessionManager.list(cwd);
  const found = sessions.find((c: any) => c.id === session || c.id.startsWith(session));
  if (!found) throw new Error(`Session not found for cwd ${cwd}: ${session}`);
  return found.path;
}

function textContent(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const text = value
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

function toolDetail(event: any): string | undefined {
  return event.errorMessage
    ?? event.error?.message
    ?? textContent(event.result?.content)
    ?? (typeof event.result === "string" ? event.result : undefined)
    ?? event.output;
}

function assistantFailure(stopReason: string | undefined, errorMessage: string | undefined): string | undefined {
  if (stopReason !== "error" && stopReason !== "aborted") return undefined;
  return errorMessage || stopReason;
}

// Run a delegated task on a streaming Pi SDK session. Mirrors the Claude backend's
// event contract so the router can treat the two interchangeably.
export async function* run(opts: RunOptions, signal: AbortSignal): AsyncIterable<DelegateEvent> {
  process.env.PI_DELEGATE ??= "1";

  const {
    AuthStorage,
    createAgentSession,
    DefaultResourceLoader,
    getAgentDir,
    ModelRegistry,
    SessionManager,
    SettingsManager,
  } = await importPiSdk();

  const agentDir = getAgentDir();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const settingsManager = SettingsManager.create(opts.cwd, agentDir);

  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir,
    settingsManager,
    appendSystemPromptOverride: (current: string[]) => [...current, WORKER_SYSTEM_PROMPT, ...opts.system],
  });
  await loader.reload();

  let model: any | undefined;
  let thinkingLevel = toThinking(opts.effort);
  if (opts.model) {
    const parsed = splitModel(opts.model);
    model = modelRegistry.find(parsed.provider, parsed.id);
    if (!model) {
      throw new Error(`Pi model not found: ${parsed.provider}/${parsed.id}. Try: pi --list-models ${parsed.provider}`);
    }
    thinkingLevel = thinkingLevel ?? parsed.thinking;
  }

  const sessionManager = opts.noSession
    ? SessionManager.inMemory(opts.cwd)
    : opts.session
    ? SessionManager.open(await findSessionPath(SessionManager, opts.cwd, opts.session))
    : SessionManager.create(opts.cwd);

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: opts.cwd,
    agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel,
    tools: opts.tools,
    sessionManager,
    settingsManager,
    resourceLoader: loader,
  });

  const pending: DelegateEvent[] = [];
  const seenAssistantMessages = new Set<any>();
  let notify: (() => void) | undefined;
  let promptDone = false;
  let promptError: Error | undefined;
  let costUsd = 0;
  let turns = 0;
  let stopReason: string | undefined;
  let errorMessage: string | undefined;

  const push = (event: DelegateEvent) => {
    pending.push(event);
    notify?.();
    notify = undefined;
  };

  const abort = () => {
    void session.abort?.();
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });

  if (modelFallbackMessage) push({ kind: "retry", attempt: 1, max: 1, message: modelFallbackMessage });
  push({ kind: "session", id: session.sessionId, ephemeral: opts.noSession });

  const applyAssistantMessage = (message: any) => {
    if (message?.role !== "assistant" || seenAssistantMessages.has(message)) return;
    seenAssistantMessages.add(message);
    turns++;
    costUsd += message.usage?.cost?.total || 0;
    stopReason = message.stopReason;
    errorMessage = message.errorMessage;
  };

  session.subscribe((event: any) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      push({ kind: "text", delta: event.assistantMessageEvent.delta });
    }
    if (event.type === "message_end") applyAssistantMessage(event.message);
    if (event.type === "agent_end") {
      for (const message of event.messages ?? []) applyAssistantMessage(message);
    }
    if (event.type === "tool_execution_end" && event.isError) {
      push({ kind: "tool_error", name: event.toolName, detail: toolDetail(event) });
    }
    if (event.type === "auto_retry_start") {
      push({ kind: "retry", attempt: event.attempt, max: event.maxAttempts, message: event.errorMessage });
    }
  });

  session.prompt(`Task: ${opts.task.trim()}`)
    .catch((err: Error) => {
      promptError = err;
    })
    .finally(() => {
      promptDone = true;
      notify?.();
      notify = undefined;
    });

  try {
    while (!promptDone || pending.length > 0) {
      if (pending.length === 0) await new Promise<void>((resolve) => (notify = resolve));
      while (pending.length > 0) yield pending.shift()!;
    }
    yield { kind: "cost", usd: costUsd, turns };
    const failure = assistantFailure(stopReason, errorMessage);
    if (signal.aborted) yield { kind: "done", ok: false, error: failure };
    else if (promptError) yield { kind: "done", ok: false, error: promptError.message };
    else if (failure) yield { kind: "done", ok: false, error: failure };
    else yield { kind: "done", ok: true };
  } finally {
    session.dispose();
    await settingsManager.flush?.();
  }
}
