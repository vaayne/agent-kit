---
name: coding-agents
description: Guide for invoking external coding agents via acpx (Agent Client Protocol CLI). Use when the user wants to delegate work to another AI agent, run code reviews, get second opinions, or manage persistent agent sessions.
metadata:
  os:
    - darwin
    - linux
---

# Coding Agents via acpx

## Prerequisites

```bash
# Preferred: global install for session reuse
npm i -g acpx

# Fallback: run without installing
bunx acpx
```

> All examples below use `acpx`. Substitute `bunx acpx` if not globally installed.

## Agent Overview

| Agent     | Command             | Best For                                 |
| --------- | ------------------- | ---------------------------------------- |
| Codex     | `acpx codex`        | Code review, sandboxed exec (default)    |
| Claude    | `acpx claude`       | Multi-file tasks, agentic workflows      |
| Gemini    | `acpx gemini`       | Fast one-shot prompts, free tier         |
| Pi        | `acpx pi`           | Extensible, skill-driven tasks           |
| Cursor    | `acpx cursor`       | IDE-integrated agent                     |
| Copilot   | `acpx copilot`      | GitHub Copilot agent                     |
| Droid     | `acpx droid`        | Factory Droid agent                      |
| Kimi      | `acpx kimi`         | Kimi agent                               |
| Kiro      | `acpx kiro`         | Kiro agent                               |
| Kilocode  | `acpx kilocode`     | Kilocode agent                           |
| OpenCode  | `acpx opencode`     | OpenCode agent                           |
| Qwen      | `acpx qwen`         | Qwen agent                               |

> Default agent (when omitted) is `codex`.

## Quick Reference

```bash
# One-shot tasks (temporary session, no state saved)
acpx exec "summarize this repo"
acpx codex exec "fix the failing test"
acpx claude exec "explain what src/index.ts does"
acpx gemini exec "list all TODO comments"

# Persistent session (auto-resumes prior conversation)
acpx codex "inspect failing tests and propose a fix"
acpx claude "refactor the auth module"

# Code review
acpx codex exec "review uncommitted changes for bugs"
acpx claude exec "review the diff against main branch"
git diff main | acpx codex exec "review this diff"

# Second opinion (different model family)
acpx codex exec "review uncommitted changes"
acpx claude exec "review uncommitted changes"

# Model override
acpx codex --model gpt-5.4 exec "refactor the auth module"
acpx claude --model sonnet exec "quick summary of this file"

# Output formats
acpx --format quiet exec "summarize repo in 3 lines"
acpx --format json codex exec "list all API endpoints"
```

## Session Workflows

```bash
# Create a new session
acpx codex sessions new

# Named parallel sessions
acpx codex -s backend "fix API pagination bug"
acpx codex -s docs "draft changelog entry"

# Queue a follow-up without waiting
acpx codex "run full test suite"
acpx codex --no-wait "after tests, summarize failures"

# List / inspect / close sessions
acpx codex sessions list
acpx codex sessions show
acpx codex sessions history --limit 20
acpx codex sessions close

# Cross-repo work
acpx --cwd ~/repos/other-project codex "fix lint errors"
```

## Permissions

| Flag              | Behavior                                      |
| ----------------- | --------------------------------------------- |
| `--approve-all`   | Auto-approve all permission requests           |
| `--approve-reads` | Auto-approve reads, prompt for writes (default)|
| `--deny-all`      | Deny all permission requests                   |

```bash
acpx --approve-all codex "fix all lint errors and commit"
acpx --deny-all claude exec "explain the architecture"
```

## Output Formats

| Format  | Use Case                         |
| ------- | -------------------------------- |
| `text`  | Human-readable stream (default)  |
| `json`  | NDJSON event stream for scripts  |
| `quiet` | Final assistant text only        |

```bash
# Machine-readable for pipelines
acpx --format json codex exec "review changes" | jq -r 'select(.type=="tool_call")'

# Clean output for scripts
result=$(acpx --format quiet exec "summarize this repo")
```

## Session Control

```bash
# Cancel an in-flight prompt
acpx codex cancel

# Change session mode
acpx codex set-mode plan        # read-only
acpx codex set-mode auto        # auto-approve

# Adjust reasoning
acpx codex set thought_level high
```

## Tips

- **Second opinion**: Use a different agent for the same review to eliminate model self-bias
- **Queue follow-ups**: Use `--no-wait` to fire-and-forget while a session is busy
- **Named sessions**: Use `-s <name>` for parallel workstreams in the same repo
- **Cost control**: Use `--max-turns` to limit agentic loops
- **Raw adapter**: `acpx --agent ./custom-acp-server "run checks"` for custom agents

