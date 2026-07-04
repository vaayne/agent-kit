#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { type BackendName, route } from "./router.ts";
import { lookupSession, saveSession } from "./registry.ts";
import type { Backend, DelegateEvent, Effort, RunOptions } from "./types.ts";

type Args = RunOptions & {
  backend?: BackendName;
  readOnly: boolean;
  explicitCwd: boolean;
  explicitModel: boolean;
  explicitBackend: boolean;
};

const DEFAULT_TIMEOUT_SEC = 600;

function usage(exitCode = 2): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: delegate.ts [options] <task>

Delegate a self-contained task to a separate agent session. The backend (Claude
Code or Pi) is chosen from the model — you never pick it directly:

  opus | sonnet | haiku | fable | claude | claude-*   -> Claude Code
  codex | gpt-5.5 | <provider/model> | <pi model>     -> Pi

stdout is only assistant text. stderr is bracketed events: backend, session,
tool errors, retries, cost, timeout, and errors.

Options:
  --task <text>            Delegated task text
  --task-file <path>       Read delegated task from file
  --model <model>          Model token that selects the backend (see above)
  --backend <pi|claude>    Force a backend instead of inferring from --model
  --cwd <path>             Working directory (default: current directory)
  --effort <level>         low|medium|high|xhigh|max (Pi caps max at xhigh)
  --tools <list>           Comma/space-separated tool allowlist (backend-native names)
  --read-only              Restrict to read-only tools for the chosen backend
  --session <id>           Resume a saved session by id
  --fork-session           Resume into a new session id (Claude only)
  --no-session             Do not persist the session
  --timeout <sec>          Abort after N seconds (default: 600; 0 disables)
  --max-turns <n>          Limit agent turns
  --permission-mode <m>    Claude only: default|acceptEdits|bypassPermissions|plan
  --system <text>          Append a system prompt (repeatable)
  --system-file <path>     Append a system prompt from file (repeatable)
  -h, --help               Show this help

Examples:
  bun scripts/delegate.ts --model opus "Review the current diff"
  bun scripts/delegate.ts --model codex "Audit this Rust crate for UB"
  bun scripts/delegate.ts --model sonnet --read-only "Map the login code paths"
  bun scripts/delegate.ts --session <id> "Continue and focus on tests"
`);
  process.exit(exitCode);
}

function readArg(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readNumber(argv: string[], index: number, name: string): number {
  const value = Number(readArg(argv, index, name));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function readInteger(argv: string[], index: number, name: string): number {
  const value = readNumber(argv, index, name);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

// Backend-native read-only tool sets. Pi names are lowercase; Claude uses CamelCase.
const READ_ONLY_TOOLS: Record<BackendName, string[]> = {
  claude: ["Read", "Grep", "Glob", "WebFetch", "WebSearch"],
  pi: ["read", "grep", "find", "ls"],
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    task: "",
    cwd: process.cwd(),
    fork: false,
    noSession: false,
    readOnly: false,
    system: [],
    permissionMode: "bypassPermissions",
    timeoutSec: DEFAULT_TIMEOUT_SEC,
    explicitCwd: false,
    explicitModel: false,
    explicitBackend: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      throw new Error("Raw -- backend flags are no longer supported; use --max-turns or first-class flags");
    }
    if (arg === "-h" || arg === "--help") usage(0);
    else if (arg === "--task") args.task = readArg(argv, i++, arg);
    else if (arg === "--task-file") args.task = readFileSync(readArg(argv, i++, arg), "utf-8");
    else if (arg === "--model") {
      args.model = readArg(argv, i++, arg);
      args.explicitModel = true;
    } else if (arg === "--backend") {
      args.backend = readArg(argv, i++, arg) as BackendName;
      args.explicitBackend = true;
    } else if (arg === "--cwd") {
      args.cwd = readArg(argv, i++, arg);
      args.explicitCwd = true;
    } else if (arg === "--effort") args.effort = readArg(argv, i++, arg) as Effort;
    else if (arg === "--tools") {
      args.tools = readArg(argv, i++, arg).split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    } else if (arg === "--read-only") args.readOnly = true;
    else if (arg === "--session") args.session = readArg(argv, i++, arg);
    else if (arg === "--fork-session") args.fork = true;
    else if (arg === "--no-session") args.noSession = true;
    else if (arg === "--timeout") args.timeoutSec = readNumber(argv, i++, arg);
    else if (arg === "--max-turns") args.maxTurns = readInteger(argv, i++, arg);
    else if (arg === "--permission-mode") args.permissionMode = readArg(argv, i++, arg);
    else if (arg === "--system") args.system.push(readArg(argv, i++, arg));
    else if (arg === "--system-file") args.system.push(readFileSync(readArg(argv, i++, arg), "utf-8"));
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (!args.task && positional.length > 0) args.task = positional.join(" ");
  if (args.backend && args.backend !== "pi" && args.backend !== "claude") {
    throw new Error("--backend must be pi or claude");
  }
  if (!args.task.trim()) usage();
  return args;
}

function applyRegistry(args: Args): void {
  if (!args.session) return;
  const record = lookupSession(args.session);
  if (!record) {
    console.error("[warn] session registry miss; pass --model/--cwd if resume fails");
    return;
  }
  if (!args.explicitBackend) args.backend = record.backend;
  if (!args.explicitModel) args.model = record.model;
  if (!args.explicitCwd) args.cwd = record.cwd;
}

function formatCost(event: Extract<DelegateEvent, { kind: "cost" }>): string {
  const usd = typeof event.usd === "number" ? `$${event.usd.toFixed(4)}` : "$?";
  const turns = typeof event.turns === "number" ? event.turns : "?";
  return `[cost] ${usd} | turns: ${turns}`;
}

async function render(
  backend: Backend,
  opts: RunOptions,
  backendName: BackendName,
  backendLabel: string,
): Promise<number> {
  const controller = new AbortController();
  let timedOut = false;
  let sessionId: string | undefined;
  let ok = true;
  let exitCode = 0;
  let wroteText = false;
  let textEndsWithNewline = true;
  let printedBackend = false;
  const timer = opts.timeoutSec > 0
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
      const resume = sessionId ? ` — resume with --session ${sessionId}` : "";
      console.error(`[timeout] after ${opts.timeoutSec}s${resume}`);
    }, opts.timeoutSec * 1000)
    : undefined;

  const newlineBeforeEvent = () => {
    if (wroteText && !textEndsWithNewline) {
      process.stdout.write("\n");
      textEndsWithNewline = true;
    }
  };

  try {
    for await (const event of backend(opts, controller.signal)) {
      if (!printedBackend) {
        console.error(backendLabel);
        printedBackend = true;
      }
      if (event.kind !== "text") newlineBeforeEvent();
      if (event.kind === "session") {
        sessionId = event.id;
        console.error(`[${event.ephemeral ? "session:ephemeral" : "session"}] ${event.id}`);
        if (!event.ephemeral) saveSession(event.id, { backend: backendName, model: opts.model, cwd: opts.cwd });
      } else if (event.kind === "text") {
        wroteText = true;
        textEndsWithNewline = event.delta.endsWith("\n");
        process.stdout.write(event.delta);
      } else if (event.kind === "tool_error") {
        const detail = event.detail ? `: ${event.detail.slice(0, 200)}` : "";
        console.error(`[tool:error] ${event.name}${detail}`);
      } else if (event.kind === "retry") {
        console.error(`[retry] ${event.attempt}/${event.max}: ${event.message}`);
      } else if (event.kind === "cost") {
        console.error(formatCost(event));
      } else if (event.kind === "done") {
        ok = event.ok;
        if (!event.ok && event.error && !timedOut) console.error(`[error] ${event.error}`);
      }
    }
  } catch (err) {
    ok = false;
    if (!timedOut) console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
    newlineBeforeEvent();
  }

  if (timedOut) exitCode = 124;
  else if (!ok) exitCode = 1;
  return exitCode;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  applyRegistry(args);
  const resolved = route(args.model, args.backend);

  if (args.readOnly && !args.tools) {
    args.tools = READ_ONLY_TOOLS[resolved.backend];
    if (resolved.backend === "claude") args.permissionMode = "default";
  }

  const opts: RunOptions = { ...args, model: resolved.model };
  const backendLabel = `[backend] ${resolved.backend}${resolved.model ? ` (${resolved.model})` : " (default)"}`;

  const backend = resolved.backend === "pi"
    ? (await import("./backends/pi.ts")).run
    : (await import("./backends/claude.ts")).run;

  return await render(backend, opts, resolved.backend, backendLabel);
}

try {
  process.exit(await main());
} catch (err) {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
