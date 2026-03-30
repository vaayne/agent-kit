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
bunx acpx

# Get real-time help info
bunx acpx --help
bunx acpx codex --help
```

## Agent Overview

| Agent     | Command             | Best For                                 |
| --------- | ------------------- | ---------------------------------------- |
| Codex     | `bunx acpx codex`        | Code review, sandboxed exec (default)    |
| Claude    | `bunx acpx claude`       | Multi-file tasks, agentic workflows      |
| Gemini    | `bunx acpx gemini`       | Fast one-shot prompts, free tier         |
| Pi        | `bunx acpx pi`           | Extensible, skill-driven tasks           |
| Cursor    | `bunx acpx cursor`       | IDE-integrated agent                     |
| Copilot   | `bunx acpx copilot`      | GitHub Copilot agent                     |
| Droid     | `bunx acpx droid`        | Factory Droid agent                      |
| Kimi      | `bunx acpx kimi`         | Kimi agent                               |
| Kiro      | `bunx acpx kiro`         | Kiro agent                               |
| Kilocode  | `bunx acpx kilocode`     | Kilocode agent                           |
| OpenCode  | `bunx acpx opencode`     | OpenCode agent                           |
| Qwen      | `bunx acpx qwen`         | Qwen agent                               |

> Default agent (when omitted) is `codex`.

## Quick Reference

```bash
# One-shot tasks (temporary session, no state saved)
bunx acpx exec "summarize this repo"
bunx acpx codex exec "fix the failing test"
bunx acpx claude exec "explain what src/index.ts does"
bunx acpx gemini exec "list all TODO comments"

# Persistent session (auto-resumes prior conversation)
bunx acpx codex "inspect failing tests and propose a fix"
bunx acpx claude "refactor the auth module"

# Code review
bunx acpx codex exec "review uncommitted changes for bugs"
bunx acpx claude exec "review the diff against main branch"
git diff main | bunx acpx codex exec "review this diff"

# Second opinion (different model family)
bunx acpx codex exec "review uncommitted changes"
bunx acpx claude exec "review uncommitted changes"

# Model override
bunx acpx codex --model gpt-5.4 exec "refactor the auth module"
bunx acpx claude --model sonnet exec "quick summary of this file"

# Output formats
bunx acpx --format quiet exec "summarize repo in 3 lines"
bunx acpx --format json codex exec "list all API endpoints"
```

## Session Workflows

```bash
# Create a new session
bunx acpx codex sessions new

# Named parallel sessions
bunx acpx codex -s backend "fix API pagination bug"
bunx acpx codex -s docs "draft changelog entry"

# Queue a follow-up without waiting
bunx acpx codex "run full test suite"
bunx acpx codex --no-wait "after tests, summarize failures"

# List / inspect / close sessions
bunx acpx codex sessions list
bunx acpx codex sessions show
bunx acpx codex sessions history --limit 20
bunx acpx codex sessions close

# Cross-repo work
bunx acpx --cwd ~/repos/other-project codex "fix lint errors"
```

## Permissions

| Flag              | Behavior                                      |
| ----------------- | --------------------------------------------- |
| `--approve-all`   | Auto-approve all permission requests           |
| `--approve-reads` | Auto-approve reads, prompt for writes (default)|
| `--deny-all`      | Deny all permission requests                   |

```bash
bunx acpx --approve-all codex "fix all lint errors and commit"
bunx acpx --deny-all claude exec "explain the architecture"
```

## Output Formats

| Format  | Use Case                         |
| ------- | -------------------------------- |
| `text`  | Human-readable stream (default)  |
| `json`  | NDJSON event stream for scripts  |
| `quiet` | Final assistant text only        |

```bash
# Machine-readable for pipelines
bunx acpx --format json codex exec "review changes" | jq -r 'select(.type=="tool_call")'

# Clean output for scripts
result=$(bunx acpx --format quiet exec "summarize this repo")
```

## Session Control

```bash
# Cancel an in-flight prompt
bunx acpx codex cancel

# Change session mode
bunx acpx codex set-mode plan        # read-only
bunx acpx codex set-mode auto        # auto-approve

# Adjust reasoning
bunx acpx codex set thought_level high
```

## Tips

- **Second opinion**: Use a different agent for the same review to eliminate model self-bias
- **Queue follow-ups**: Use `--no-wait` to fire-and-forget while a session is busy
- **Named sessions**: Use `-s <name>` for parallel workstreams in the same repo
- **Cost control**: Use `--max-turns` to limit agentic loops
- **Raw adapter**: `bunx acpx --agent ./custom-acp-server "run checks"` for custom agents

