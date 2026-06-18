---
name: delegate
description: Delegate a self-contained task to a separate streaming agent session, then summarize the result. The backend (Claude Code or Pi) is chosen automatically from the model you name — say "let opus/sonnet/claude look at it" to route to Claude Code, or "let codex/gpt look at it" to route to Pi. Use when the user wants delegation, subagents, parallel research, isolated context, resuming a delegated task, or running a task on a specific model regardless of which runtime backs it.
---

# Delegate

One delegation interface over two runtimes. You name a model; the skill picks the backend. Use the bundled CLI as the default path:

```bash
bun scripts/delegate.ts --model <model> "Task: <self-contained delegated prompt>"
```

Run from this skill directory; paths are skill-relative. The script is self-documenting via `--help`.

## Routing (model → backend)

The model token is the only thing that selects the runtime — you never pick it directly:

| You say…                            | Model token                                       | Backend                     |
| ----------------------------------- | ------------------------------------------------- | --------------------------- |
| "let opus/sonnet/claude look at it" | `opus` `sonnet` `haiku` `fable` `claude-*`        | Claude Code                 |
| no model named                      | (omitted) / `claude`                              | Claude Code                 |
| "let codex look at it"              | `codex`                                           | Pi → `openai-codex/gpt-5.5` |
| a specific OpenAI/HF model          | `gpt-5.5`, `GLM-5`, `kimi-k2.6`, `provider/model` | Pi                          |

Unknown Pi tokens are resolved against `pi --list-models`; ambiguous ones error and ask for a full `provider/model` id. Force a backend with `--backend pi|claude` when you must.

## Agent workflow

1. Delegate only when isolation, parallelism, resume, or model specialization is useful.
2. Rewrite the child prompt so it stands alone: goal, cwd/repo, relevant constraints, expected output, and stop conditions.
3. Map the user's intent to a model: a Claude model → Claude Code; codex/gpt/other → Pi. Add only the options needed (`--effort`, `--cwd`, `--tools`/`--read-only`, `--system[-file]`, `--task-file`, `--session`, `--no-session`).
4. Capture `[session] ...` from stderr for resumable runs; `[session:ephemeral] ...` is not resumable. `[backend] ...` tells you which runtime ran it.
5. Treat delegate output as evidence, not truth. Verify high-impact claims before acting or reporting.

## Permissions

Claude-backed runs default to `--permission-mode bypassPermissions` so tools execute without prompts (a one-shot `claude -p` can't answer prompts). For untrusted work, use `--read-only` (restricts tools and drops Claude to `default` permission) or set `--tools` / `--permission-mode` explicitly. Pi tool names are lowercase (`read,grep,find,ls`); Claude's are CamelCase (`Read,Grep,Glob`).

## Patterns

Resume (works for either backend; ids are captured from stderr):

```bash
bun scripts/delegate.ts --session "<session-id>" "Task: <follow-up prompt>"
```

Pick a model / effort:

```bash
bun scripts/delegate.ts --model opus --effort high "Task: <prompt>"
bun scripts/delegate.ts --model codex "Task: <prompt>"
```

Read-only review:

```bash
bun scripts/delegate.ts --model sonnet --read-only "Task: <prompt>"
```

Forward backend-specific flags the wrapper doesn't expose (Claude backend only; Pi ignores them with a warning):

```bash
bun scripts/delegate.ts --model opus "Task: <prompt>" -- --add-dir ../other-repo --max-turns 3
```

For parallel work, run independent invocations with separate stdout/stderr files, then reconcile the results yourself.
