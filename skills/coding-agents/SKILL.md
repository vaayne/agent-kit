---
name: coding-agents
description: Invoke external coding agents via acpx with preset roles (oracle, reviewer, worker, ui-engineer, librarian) for delegation, code review, second opinions, and persistent agent sessions.
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

## Preset Roles

Role prompts live in `references/agents/` relative to this skill. Prepend them to your task prompt for structured delegation.

| Role            | File                                       | Purpose                                |
| --------------- | ------------------------------------------ | -------------------------------------- |
| `oracle`        | [oracle.md](./references/agents/oracle.md) | Architecture advice, critique, planning |
| `reviewer`      | [reviewer.md](./references/agents/reviewer.md) | Code review with structured feedback |
| `worker`        | [worker.md](./references/agents/worker.md) | General-purpose task execution         |
| `ui-engineer`   | [ui-engineer.md](./references/agents/ui-engineer.md) | Visual/UI design and implementation |
| `librarian`     | [librarian.md](./references/agents/librarian.md) | Code search, docs lookup, examples |

### Using a preset role

Read the role file and prepend it to the task prompt:

```bash
# Code review with reviewer role
bunx acpx codex exec "$(cat {skill_dir}/references/agents/reviewer.md)

Review the changes in src/auth/ for security issues"

# Architecture advice with oracle role
bunx acpx claude exec "$(cat {skill_dir}/references/agents/oracle.md)

Review this architecture and recommend improvements"

# General task with worker role
bunx acpx codex exec "$(cat {skill_dir}/references/agents/worker.md)

Refactor the logger module to use structured logging"

# Pipe role + task via stdin
(cat {skill_dir}/references/agents/reviewer.md; echo; echo "Review uncommitted changes") | bunx acpx claude exec
```

### Model selection guide

| Task Type                          | Recommended Tier                 |
| ---------------------------------- | -------------------------------- |
| Complex reasoning, critique        | Best (opus, pro, codex)          |
| Coding tasks                       | GPT codex variants, Claude opus  |
| General purpose                    | Balanced (sonnet, codex default) |
| Fast, cheap, high-volume           | Fast (haiku, flash)              |
| Vision / image understanding       | Gemini flash                     |

## Tips

- **Second opinion**: Use a different agent for the same review to eliminate model self-bias
- **Queue follow-ups**: Use `--no-wait` to fire-and-forget while a session is busy
- **Named sessions**: Use `-s <name>` for parallel workstreams in the same repo
- **Cost control**: Use `--max-turns` to limit agentic loops
- **Raw adapter**: `bunx acpx --agent ./custom-acp-server "run checks"` for custom agents
- **Preset roles**: Combine any role with any agent — e.g., oracle + claude for architecture, reviewer + codex for reviews

