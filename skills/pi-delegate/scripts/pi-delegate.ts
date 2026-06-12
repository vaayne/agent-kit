#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

type Args = {
  task?: string;
  cwd: string;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
  session?: string;
  noSession: boolean;
  system?: string;
  systemFile?: string;
};

function usage(exitCode = 2): never {
  const output = exitCode === 0 ? console.log : console.error;
  output(`Usage: pi-delegate.ts [options] <task>

Options:
  --task <text>          Delegated task text
  --task-file <path>     Read delegated task from file
  --cwd <path>           Working directory (default: current directory)
  --model <model>        Model as provider/model or provider/model:thinking
  --thinking <level>     off|minimal|low|medium|high|xhigh
  --tools <list>         Comma-separated tool allowlist
  --session <id|path>    Resume a saved Pi session
  --no-session           Do not persist the delegated session
  --system <text>        Append system prompt text
  --system-file <path>   Append system prompt from file
  -h, --help             Show this help

Examples:
  bun skills/pi-delegate/scripts/pi-delegate.ts --model openai/gpt-5.5 "Review the current diff"
  bun skills/pi-delegate/scripts/pi-delegate.ts --session 019... "Continue and focus on tests"
`);
  process.exit(exitCode);
}

function readArg(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { cwd: process.cwd(), noSession: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage(0);
    if (arg === "--task") args.task = readArg(argv, i++, arg);
    else if (arg === "--task-file") args.task = readFileSync(readArg(argv, i++, arg), "utf-8");
    else if (arg === "--cwd") args.cwd = readArg(argv, i++, arg);
    else if (arg === "--model") args.model = readArg(argv, i++, arg);
    else if (arg === "--thinking") args.thinking = readArg(argv, i++, arg) as ThinkingLevel;
    else if (arg === "--tools") {
      args.tools = readArg(argv, i++, arg).split(",").map((tool) => tool.trim()).filter(Boolean);
    } else if (arg === "--session") args.session = readArg(argv, i++, arg);
    else if (arg === "--no-session") args.noSession = true;
    else if (arg === "--system") args.system = readArg(argv, i++, arg);
    else if (arg === "--system-file") args.systemFile = readArg(argv, i++, arg);
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (!args.task && positional.length > 0) args.task = positional.join(" ");
  if (!args.task?.trim()) usage();
  return args;
}

async function importPiSdk(): Promise<any> {
  const explicitEntry = process.env.PI_SDK_ENTRY;
  if (explicitEntry) return await import(pathToFileURL(explicitEntry).href);

  // Scripts in skills are often outside a Node package. Prefer the globally
  // installed Pi SDK instead of letting a runtime auto-install a mismatched copy.
  const npmRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf-8" }).stdout.trim();
  if (npmRoot) {
    const entry = join(npmRoot, "@earendil-works", "pi-coding-agent", "dist", "index.js");
    if (existsSync(entry)) return await import(pathToFileURL(entry).href);
  }

  return await import("@earendil-works/pi-coding-agent");
}

function splitModel(value: string): { provider: string; id: string; thinking?: ThinkingLevel } {
  const thinkingMatch = value.match(/^(.*):(off|minimal|low|medium|high|xhigh)$/);
  const model = thinkingMatch ? thinkingMatch[1] : value;
  const slash = model.indexOf("/");
  if (slash === -1) throw new Error("--model must be provider/model");
  return {
    provider: model.slice(0, slash),
    id: model.slice(slash + 1),
    thinking: thinkingMatch?.[2] as ThinkingLevel | undefined,
  };
}

async function findSessionPath(SessionManager: any, cwd: string, session: string): Promise<string> {
  if (existsSync(session)) return session;
  const sessions = await SessionManager.list(cwd);
  const found = sessions.find((candidate: any) => candidate.id === session || candidate.id.startsWith(session));
  if (!found) throw new Error(`Session not found for cwd ${cwd}: ${session}`);
  return found.path;
}

const args = parseArgs(process.argv.slice(2));
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
const settingsManager = SettingsManager.create(args.cwd, agentDir);
const appendSystemPrompt: string[] = [];
if (args.system) appendSystemPrompt.push(args.system);
if (args.systemFile) appendSystemPrompt.push(readFileSync(args.systemFile, "utf-8"));

const loader = new DefaultResourceLoader({
  cwd: args.cwd,
  agentDir,
  settingsManager,
  appendSystemPromptOverride: (current: string[]) => [...current, ...appendSystemPrompt],
});
await loader.reload();

let model: any | undefined;
let thinkingLevel = args.thinking;
if (args.model) {
  const parsed = splitModel(args.model);
  model = modelRegistry.find(parsed.provider, parsed.id);
  if (!model) {
    throw new Error(`Model not found: ${parsed.provider}/${parsed.id}. Try: pi --list-models ${parsed.provider}`);
  }
  thinkingLevel = thinkingLevel ?? parsed.thinking;
}

const sessionManager = args.noSession
  ? SessionManager.inMemory(args.cwd)
  : args.session
  ? SessionManager.open(await findSessionPath(SessionManager, args.cwd, args.session))
  : SessionManager.create(args.cwd);

const { session, modelFallbackMessage } = await createAgentSession({
  cwd: args.cwd,
  agentDir,
  authStorage,
  modelRegistry,
  model,
  thinkingLevel,
  tools: args.tools,
  sessionManager,
  settingsManager,
  resourceLoader: loader,
});

let wroteText = false;
try {
  if (modelFallbackMessage) console.error(`[model fallback] ${modelFallbackMessage}`);
  console.error(args.noSession ? `[session:ephemeral] ${session.sessionId}` : `[session] ${session.sessionId}`);

  session.subscribe((event: any) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      wroteText = true;
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.type === "tool_execution_start") {
      console.error(`\n[tool:start] ${event.toolName}`);
    }
    if (event.type === "tool_execution_end") {
      console.error(`[tool:end] ${event.toolName} ${event.isError ? "error" : "ok"}`);
    }
    if (event.type === "auto_retry_start") {
      console.error(`[retry] ${event.attempt}/${event.maxAttempts}: ${event.errorMessage}`);
    }
  });

  await session.prompt(`Task: ${args.task.trim()}`);
  if (wroteText) process.stdout.write("\n");
} finally {
  session.dispose();
  await settingsManager.flush?.();
}
