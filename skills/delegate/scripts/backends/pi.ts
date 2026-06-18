import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Effort, RunOptions } from "../types.ts";

type Thinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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

// Run a delegated task on a streaming Pi SDK session. Mirrors the Claude backend's
// stdout/stderr contract so the router can treat the two interchangeably.
export async function run(opts: RunOptions): Promise<number> {
  process.env.PI_DELEGATE ??= "1";
  if (opts.passthrough.length) {
    console.error(
      `[warn] ignoring passthrough args (Pi backend is SDK-based, not a CLI): ${opts.passthrough.join(" ")}`,
    );
  }

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
    appendSystemPromptOverride: (current: string[]) => [...current, ...opts.system],
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

  let wroteText = false;
  try {
    if (modelFallbackMessage) console.error(`[model fallback] ${modelFallbackMessage}`);
    console.error(`[${opts.noSession ? "session:ephemeral" : "session"}] ${session.sessionId}`);

    session.subscribe((event: any) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        wroteText = true;
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      if (event.type === "tool_execution_start") console.error(`\n[tool:start] ${event.toolName}`);
      if (event.type === "tool_execution_end") console.error(`[tool:end] ${event.isError ? "error" : "ok"}`);
      if (event.type === "auto_retry_start") {
        console.error(`[retry] ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`);
      }
    });

    await session.prompt(`Task: ${opts.task.trim()}`);
    if (wroteText) process.stdout.write("\n");
  } finally {
    session.dispose();
    await settingsManager.flush?.();
  }
  return 0;
}
