# pi-delegate CLI

A tiny streaming delegate runner built on the Pi SDK.

It starts a separate Pi session, streams assistant text to stdout, prints session/tool status to stderr, and supports resuming the same delegated session later.

## Requirements

- `pi` installed globally
- `bun` available to run the TypeScript script
- Pi auth already configured (`pi /login` or provider API keys)

The script loads the SDK from the global Pi installation. If needed, override the SDK entry file:

```bash
PI_SDK_ENTRY=/path/to/@earendil-works/pi-coding-agent/dist/index.js \
  bun scripts/pi-delegate.ts "Say hi"
```

## Basic usage

Run commands from this skill directory (`skills/pi-delegate/`). If you are elsewhere, use the path to this directory's `scripts/pi-delegate.ts`.

```bash
bun scripts/pi-delegate.ts "Task: inspect this repo and summarize the architecture"
```

The command prints:

- stdout: streamed assistant answer
- stderr: session ID, tool events, retries, warnings

Example stderr:

```text
[session] 019eb5c0-...
[tool:start] read
[tool:end] read ok
```

Use the session ID for resume.

## Resume

```bash
bun scripts/pi-delegate.ts \
  --session 019eb5c0-... \
  "Continue from the previous review and focus on tests"
```

`--session` accepts a full session ID, a unique prefix, or a session file path.

## Model selection

```bash
bun scripts/pi-delegate.ts \
  --model openai/gpt-5.5 \
  "Review the current diff"
```

Thinking level:

```bash
bun scripts/pi-delegate.ts \
  --model openai/gpt-5.5 \
  --thinking high \
  "Find correctness bugs"
```

Shorthand also works:

```bash
bun scripts/pi-delegate.ts \
  --model openai/gpt-5.5:high \
  "Find correctness bugs"
```

If a model fails, list available models and retry with one that works:

```bash
pi --list-models
pi --list-models openai
pi --list-models claude
```

## Working directory

```bash
bun scripts/pi-delegate.ts \
  --cwd /path/to/repo \
  "Map the code paths for login"
```

## Tool allowlist

Read-only review:

```bash
bun scripts/pi-delegate.ts \
  --tools read,grep,find,ls \
  "Review the repository for risky config files"
```

## System prompt

Inline:

```bash
bun scripts/pi-delegate.ts \
  --system "You are a strict code reviewer. Return only actionable findings." \
  "Audit the current diff"
```

From file:

```bash
bun scripts/pi-delegate.ts \
  --system-file /tmp/reviewer.md \
  "Audit the current diff"
```

## Task from file

```bash
bun scripts/pi-delegate.ts --task-file /tmp/delegate-task.md
```

## Ephemeral run

Use this when you do not need resume:

```bash
bun scripts/pi-delegate.ts --no-session "Answer in one sentence"
```

## Full options

```text
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
-h, --help             Show help
```

## When not to use this

For one-off final answers, plain Pi is simpler:

```bash
pi -p "Task: answer this"
```

Use this CLI when you want streaming output plus a clean session ID for later resume.
