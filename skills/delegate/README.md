# delegate CLI

A streaming delegation CLI over two SDK-backed runtimes: **Claude Code** via `@anthropic-ai/claude-agent-sdk` and **Pi** via the Pi SDK. You name a model; the CLI routes to the right backend, streams only the assistant answer to stdout, and prints bracketed events to stderr.

## Requirements

- `bun` to run plain TypeScript directly
- For Claude-routed models: Claude Code authenticated on this machine; first run may let Bun resolve `@anthropic-ai/claude-agent-sdk`
- For Pi-routed models: `pi` installed and authenticated, with the Pi SDK available globally (override with `PI_SDK_ENTRY=/path/to/dist/index.js`)

## Basic usage

Run from the project directory you want the worker to inspect. Use an absolute script path so the process cwd remains the project:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus "Task: inspect this repo and summarize the architecture"
bun ~/.agents/skills/delegate/scripts/delegate.ts --model codex "Task: audit this crate for undefined behavior"
```

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

To add a new model alias or backend mapping, edit `scripts/routes.ts`.

## I/O and exit contract

| Stream / exit | Contract                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| stdout        | Raw assistant answer text only.                                                                                                  |
| stderr        | Bracketed events: `[backend]`, `[session]` / `[session:ephemeral]`, `[tool:error]`, `[retry]`, `[cost]`, `[timeout]`, `[error]`. |
| exit `0`      | Success.                                                                                                                         |
| exit `124`    | Timeout.                                                                                                                         |
| exit `2`      | Usage, argument, or routing error.                                                                                               |
| exit `1`      | Backend execution failure.                                                                                                       |

Example stderr:

```text
[backend] claude (haiku)
[session] 019ed89d-...
[cost] $0.0249 | turns: 2
```

Tool calls run silently; only failures are reported as `[tool:error] <name>: <detail>`. Both backends emit `[cost] $... | turns: ...`.

## Timeout

`--timeout <sec>` applies to both backends. Default: `600`. Use `--timeout 0` to disable it.

On timeout, stderr includes the resumable id when one exists:

```text
[timeout] after 3s — resume with --session 019ed89d-...
```

If the parent Bash tool has a shorter timeout than the delegate, raise the parent timeout or run the delegate in the background and tail stdout/stderr.

## Resume and registry

Persisted sessions print `[session] <id>` and are recorded in `~/.agents/delegate-sessions.json` with backend, model, cwd, and creation time. Resume with just the id; the registry restores the original backend/model/cwd unless you explicitly override flags:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --session 019ed89d-... "Continue and focus on tests"
```

`[session:ephemeral]` comes from `--no-session` and is not resumable. `--fork-session` branches a Claude session into a new id.

## Worker isolation

Delegated workers get a system prompt telling them to return raw findings/results directly: no persona and no process meta-commentary. Claude loads project/local settings but skips user-level settings; Pi receives the same worker prompt through the SDK resource loader.

## Effort

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model sonnet --effort high "Find correctness bugs"
```

`--effort` is `low|medium|high|xhigh|max`. Pi caps `max` at `xhigh`.

## Tools and read-only

`--read-only` applies the backend's safe tool set and drops Claude to `default` permission:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model sonnet --read-only "Review for risky config files"
```

Or set an explicit tool list with backend-native tool names:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus --tools Read,Grep,Glob --permission-mode default "..."
bun ~/.agents/skills/delegate/scripts/delegate.ts --model codex --tools read,grep,find,ls "..."
```

## Permissions (Claude backend)

Claude defaults to `bypassPermissions` so a non-interactive worker can run tools. Tighten with `--permission-mode default|acceptEdits|plan` or `--read-only`. Pi runs its tools directly; the Claude permission flag does not affect Pi.

## System prompt

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus \
  --system "You are a strict code reviewer. Return only actionable findings." \
  "Audit the current diff"

bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus --system-file /tmp/reviewer.md "Audit the current diff"
```

Both `--system` and `--system-file` are repeatable and are appended after the worker isolation prompt.

## Working directory / task file / ephemeral

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus --cwd /path/to/repo "Map the login code paths"
bun ~/.agents/skills/delegate/scripts/delegate.ts --model codex --task-file /tmp/delegate-task.md
bun ~/.agents/skills/delegate/scripts/delegate.ts --model haiku --no-session "Answer in one sentence"
```

## Full options

```text
--task <text>            Delegated task text
--task-file <path>       Read delegated task from file
--model <model>          Model token that selects the backend
--backend <pi|claude>    Force a backend instead of inferring from --model
--cwd <path>             Working directory (default: current directory)
--effort <level>         low|medium|high|xhigh|max
--tools <list>           Comma/space-separated tool list (backend-native names)
--read-only              Restrict to read-only tools for the chosen backend
--session <id>           Resume a saved session by id
--fork-session           Resume into a new session id (Claude only)
--no-session             Do not persist the session
--timeout <sec>          Abort after N seconds (default: 600; 0 disables)
--max-turns <n>          Limit agent turns
--permission-mode <m>    Claude only: default|acceptEdits|bypassPermissions|plan
--system <text>          Append a system prompt (repeatable)
--system-file <path>     Append a system prompt from file (repeatable)
-h, --help               Show help
```

## Layout

```text
scripts/
  delegate.ts        # entry: parse args, registry, timeout, render events
  registry.ts        # ~/.agents/delegate-sessions.json load/save/prune
  router.ts          # routing logic (slash = full id, search fallback)
  routes.ts          # routing data — edit this to add models/aliases
  types.ts           # shared RunOptions / DelegateEvent / Backend types
  package.json       # Claude Agent SDK dependency for Bun auto-resolution
  backends/
    claude.ts        # Claude Agent SDK backend
    pi.ts            # Pi SDK backend
```
