# delegate CLI

One streaming delegation interface over two runtimes — **Claude Code** (`claude -p`) and **Pi** (Pi SDK). You name a model; the CLI routes to the right backend, streams the assistant answer to stdout, and prints session/tool/cost events to stderr. The backend choice is hidden: callers think in models, not runtimes.

## Requirements

- `bun` to run the TypeScript
- For Claude-routed models: `claude` (Claude Code) installed and authenticated
- For Pi-routed models: `pi` installed and authenticated, with the Pi SDK available globally (override with `PI_SDK_ENTRY=/path/to/dist/index.js`)

## Routing

The `--model` token selects the backend:

```text
opus | sonnet | haiku | fable | claude | claude-*   -> Claude Code
(no model) / claude                                 -> Claude Code (default model)
codex                                               -> Pi  (openai-codex/gpt-5.5)
gpt-5.5 | GLM-5 | kimi-k2.6 | <provider/model>      -> Pi
```

- A token containing `/` is treated as a full Pi `provider/model` id.
- Any other non-Claude token is resolved against `pi --list-models`; if it matches exactly one model it routes to Pi, otherwise it errors and asks for a full id.
- `--backend pi|claude` forces a backend regardless of the model.

To add a new model alias or backend mapping, edit `scripts/routes.ts` — no router code changes needed.

## Basic usage

Run from this skill directory (`skills/delegate/`).

```bash
bun scripts/delegate.ts --model opus "Task: inspect this repo and summarize the architecture"
bun scripts/delegate.ts --model codex "Task: audit this crate for undefined behavior"
```

Output:

- stdout: streamed assistant answer
- stderr: backend, session id, tool events, cost, errors

Example stderr:

```text
[backend] claude (opus)
[session] 019ed89d-...
[cost] $0.0249 | turns: 2
```

Tool calls run silently; only failures are reported, as `[tool:error] <name>`. The
`[cost]` line is Claude-only. `[session] <id>` is resumable; `[session:ephemeral]` is not.

## Resume

```bash
bun scripts/delegate.ts --session 019ed89d-... "Continue and focus on tests"
```

Add `--fork-session` (Claude only) to branch into a new session id.

## Effort

```bash
bun scripts/delegate.ts --model sonnet --effort high "Find correctness bugs"
```

`--effort` is `low|medium|high|xhigh|max`. Pi caps `max` at its `xhigh`.

## Tools and read-only

`--read-only` applies the backend's safe tool set (and drops Claude to `default` permission):

```bash
bun scripts/delegate.ts --model sonnet --read-only "Review for risky config files"
```

Or set an explicit allowlist with backend-native tool names:

```bash
bun scripts/delegate.ts --model opus --tools Read,Grep,Glob --permission-mode default "..."
bun scripts/delegate.ts --model codex --tools read,grep,find,ls "..."
```

## Passthrough flags

For anything the wrapper doesn't expose, put `--` and then raw flags forwarded
verbatim to the backend CLI:

```bash
bun scripts/delegate.ts --model opus "Plan it" -- --add-dir ../other-repo --max-turns 3
```

Passthrough works with the **Claude** backend only (it spawns `claude`). The Pi
backend is SDK-based, so passthrough args there are ignored with a warning.

## Permissions (Claude backend)

Defaults to `bypassPermissions` so a non-interactive `claude -p` can actually run tools. Tighten with `--permission-mode default|acceptEdits|plan` or `--read-only`. (Pi runs its tools directly; this flag is a no-op there.)

## System prompt

```bash
bun scripts/delegate.ts --model opus \
  --system "You are a strict code reviewer. Return only actionable findings." \
  "Audit the current diff"

bun scripts/delegate.ts --model opus --system-file /tmp/reviewer.md "Audit the current diff"
```

Both `--system` and `--system-file` are repeatable.

## Working directory / task file / ephemeral

```bash
bun scripts/delegate.ts --model opus --cwd /path/to/repo "Map the login code paths"
bun scripts/delegate.ts --model codex --task-file /tmp/delegate-task.md
bun scripts/delegate.ts --model haiku --no-session "Answer in one sentence"
```

## Full options

```text
--task <text>            Delegated task text
--task-file <path>       Read delegated task from file
--model <model>          Model token that selects the backend
--backend <pi|claude>    Force a backend instead of inferring from --model
--cwd <path>             Working directory (default: current directory)
--effort <level>         low|medium|high|xhigh|max
--tools <list>           Comma/space-separated tool allowlist (backend-native names)
--read-only              Restrict to read-only tools for the chosen backend
--session <id>           Resume a saved session by id
--fork-session           Resume into a new session id (Claude only)
--no-session             Do not persist the session
--permission-mode <m>    Claude only: default|acceptEdits|bypassPermissions|plan
--system <text>          Append a system prompt (repeatable)
--system-file <path>     Append a system prompt from file (repeatable)
-h, --help               Show help
```

## Layout

```text
scripts/
  delegate.ts        # entry: parse args, route by model, dispatch
  router.ts          # routing logic (slash = full id, search fallback)
  routes.ts          # routing DATA — edit this to add models/aliases
  types.ts           # shared RunOptions / Backend types
  backends/
    claude.ts        # claude -p backend
    pi.ts            # Pi SDK backend
```
