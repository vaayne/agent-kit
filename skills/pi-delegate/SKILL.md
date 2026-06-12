---
name: pi-delegate
description: Delegate work to separate streaming Pi SDK sessions, then summarize results back to the user. Use when the user wants delegation, subagents, parallel research, isolated context, resuming a delegated task, trying a different model, or explicitly mentions pi delegate/resume/model CLI workflows. Prefer this skill when direct Pi CLI/SDK delegation is requested instead of extension-specific delegate tools.
---

# Pi Delegate

Use the bundled CLI as the default path:

```bash
bun scripts/pi-delegate.ts "Task: <self-contained delegated prompt>"
```

Run from this skill directory; paths are skill-relative. The script is self-documenting via `--help`.

## Agent workflow

1. Delegate only when isolation, parallelism, resume, or model specialization is useful.
2. Rewrite the child prompt so it stands alone: goal, cwd/repo, relevant constraints, expected output, and stop conditions.
3. Use `scripts/pi-delegate.ts`; add only the options needed (`--session`, `--model`, `--thinking`, `--cwd`, `--tools`, `--system-file`, `--task-file`, `--no-session`).
4. Capture `[session] ...` from stderr for resumable runs; `[session:ephemeral] ...` is not resumable.
5. Treat delegate output as evidence, not truth. Verify high-impact claims before acting or reporting.

## Patterns

Resume:

```bash
bun scripts/pi-delegate.ts --session "<session-id>" "Task: <follow-up prompt>"
```

Different model:

```bash
bun scripts/pi-delegate.ts --model "<provider/model>:high" "Task: <prompt>"
```

Read-only review:

```bash
bun scripts/pi-delegate.ts --tools read,grep,find,ls "Task: <prompt>"
```

If model selection fails, check available models with `pi --list-models [search]`, retry once with a usable model, and report the fallback.

For parallel work, run independent CLI invocations with separate stdout/stderr files, then reconcile the results yourself.

Fallback only if the script cannot run:

```bash
pi -p "Task: <self-contained delegated prompt>"
```
