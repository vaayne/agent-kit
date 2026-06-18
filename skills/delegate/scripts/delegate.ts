#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { route, type BackendName } from "./router.ts";
import type { Effort, RunOptions } from "./types.ts";

type Args = RunOptions & { backend?: BackendName; readOnly: boolean };

function usage(exitCode = 2): never {
  const out = exitCode === 0 ? console.log : console.error;
  out(`Usage: delegate.ts [options] <task>

Delegate a self-contained task to a separate agent session. The backend (Claude
Code or Pi) is chosen from the model — you never pick it directly:

  opus | sonnet | haiku | fable | claude | claude-*   -> Claude Code
  codex | gpt-5.5 | <provider/model> | <pi model>     -> Pi

Assistant text streams to stdout; session/tool/cost events go to stderr. Capture
the [session] id from stderr to resume later.

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
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") usage(0);
    else if (arg === "--task") args.task = readArg(argv, i++, arg);
    else if (arg === "--task-file") args.task = readFileSync(readArg(argv, i++, arg), "utf-8");
    else if (arg === "--model") args.model = readArg(argv, i++, arg);
    else if (arg === "--backend") args.backend = readArg(argv, i++, arg) as BackendName;
    else if (arg === "--cwd") args.cwd = readArg(argv, i++, arg);
    else if (arg === "--effort") args.effort = readArg(argv, i++, arg) as Effort;
    else if (arg === "--tools") args.tools = readArg(argv, i++, arg).split(/[,\s]+/).map((t) => t.trim()).filter(Boolean);
    else if (arg === "--read-only") args.readOnly = true;
    else if (arg === "--session") args.session = readArg(argv, i++, arg);
    else if (arg === "--fork-session") args.fork = true;
    else if (arg === "--no-session") args.noSession = true;
    else if (arg === "--permission-mode") args.permissionMode = readArg(argv, i++, arg);
    else if (arg === "--system") args.system.push(readArg(argv, i++, arg));
    else if (arg === "--system-file") args.system.push(readFileSync(readArg(argv, i++, arg), "utf-8"));
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (!args.task && positional.length > 0) args.task = positional.join(" ");
  if (args.backend && args.backend !== "pi" && args.backend !== "claude") throw new Error("--backend must be pi or claude");
  if (!args.task.trim()) usage();
  return args;
}

const args = parseArgs(process.argv.slice(2));
const resolved = route(args.model, args.backend);

if (args.readOnly && !args.tools) {
  args.tools = READ_ONLY_TOOLS[resolved.backend];
  if (resolved.backend === "claude") args.permissionMode = "default";
}

const opts: RunOptions = { ...args, model: resolved.model };
console.error(`[backend] ${resolved.backend}${resolved.model ? ` (${resolved.model})` : " (default)"}`);

const backend = resolved.backend === "pi"
  ? (await import("./backends/pi.ts")).run
  : (await import("./backends/claude.ts")).run;

process.exit(await backend(opts));
