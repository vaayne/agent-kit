---
name: delegate
description: Delegate a self-contained task to a separate streaming agent session, then summarize the result. The backend (Claude Code or Pi) is chosen automatically from the model you name — say "let opus/sonnet/claude look at it" to route to Claude Code, or "let codex/gpt look at it" to route to Pi. Use when the user wants delegation, subagents, parallel research, isolated context, resuming a delegated task, or running a task on a specific model regardless of which runtime backs it.
---

# Delegate

One delegation interface over two SDK-backed runtimes. You name a model; the CLI picks Claude Code or Pi, streams only the worker answer to stdout, and writes machine-readable event lines to stderr.

Use it from the project you want the worker to inspect, with the script path absolute so `cwd` stays correct:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model <model> "Task: <self-contained delegated prompt>"
```

The first Claude-routed run may ask Bun to resolve `@anthropic-ai/claude-agent-sdk`; no build step is needed.

## I/O contract

| Stream / exit | Contract                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| stdout        | Raw assistant answer text only. No status lines.                                                                                 |
| stderr        | Bracketed events: `[backend]`, `[session]` / `[session:ephemeral]`, `[tool:error]`, `[retry]`, `[cost]`, `[timeout]`, `[error]`. |
| exit `0`      | Success.                                                                                                                         |
| exit `124`    | Timeout. Resume with `--session <id>` when stderr printed a resumable session id.                                                |
| exit `2`      | Usage, argument, or routing error.                                                                                               |
| exit `1`      | Backend execution failure.                                                                                                       |

Default timeout is 600s. Use `--timeout 0` to disable it. If the parent Bash tool has a shorter timeout, either raise the parent timeout or run the delegate in the background and tail its output.

## Routing (model → backend)

The model token selects the runtime:

| You say…                            | Model token                                       | Backend                     |
| ----------------------------------- | ------------------------------------------------- | --------------------------- |
| "let opus/sonnet/claude look at it" | `opus` `sonnet` `haiku` `fable` `claude-*`        | Claude Code                 |
| no model named                      | omitted / `claude`                                | Claude Code                 |
| "let codex look at it"              | `codex`                                           | Pi → `openai-codex/gpt-5.5` |
| a specific OpenAI/HF model          | `gpt-5.5`, `GLM-5`, `kimi-k2.6`, `provider/model` | Pi                          |

Unknown Pi tokens are resolved against `pi --list-models`; ambiguous ones error and ask for a full `provider/model` id. Force a backend with `--backend pi|claude` only when routing inference is wrong.

## Agent workflow

1. Delegate only when isolation, parallelism, resume, or model specialization is useful.
2. Rewrite the child prompt so it stands alone: goal, repo/cwd, constraints, expected output, and stop conditions.
3. Pick the model token: Claude model → Claude Code; codex/gpt/other → Pi.
4. Add only the options needed: `--effort`, `--cwd`, `--tools`, `--read-only`, `--system[-file]`, `--task-file`, `--session`, `--no-session`, `--timeout`, `--max-turns`.
5. Treat delegate output as evidence, not truth. Verify high-impact claims before acting or reporting.

## Resume

For persisted sessions, stderr prints `[session] <id>` and records backend/model/cwd in `~/.agents/delegate-sessions.json`. Resume with only the id:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --session "<session-id>" "Task: <follow-up prompt>"
```

`[session:ephemeral]` comes from `--no-session` and is not resumable. `--fork-session` branches a Claude session into a new id.

## Permissions and isolation

Delegated workers get an isolation prompt: return raw findings/results, no persona, no process chatter. Claude excludes user-level settings while keeping project/local context; Pi gets the same worker prompt through its SDK resource loader.

Claude-backed runs default to `--permission-mode bypassPermissions` so tools execute without prompts. For untrusted work, use `--read-only` or set `--tools` / `--permission-mode` explicitly. Pi tool names are lowercase (`read,grep,find,ls`); Claude tool names are CamelCase (`Read,Grep,Glob`).

## Patterns

Pick a model / effort:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model opus --effort high "Task: <prompt>"
bun ~/.agents/skills/delegate/scripts/delegate.ts --model codex "Task: <prompt>"
```

Read-only review:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model sonnet --read-only "Task: <prompt>"
```

Limit turns or timeout:

```bash
bun ~/.agents/skills/delegate/scripts/delegate.ts --model haiku --max-turns 3 --timeout 120 "Task: <prompt>"
```

For parallel work, run independent invocations with separate stdout/stderr files, then reconcile the results yourself.
