# Codex CLI Reference

OpenAI's Codex CLI agent for code review and autonomous task execution.

> **Prefer acpx**: Most tasks can use `acpx codex exec "..."` or `acpx codex "..."` for unified session management. Use direct CLI below for advanced features (sandbox policies, review command, MCP).

## Commands

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `codex [PROMPT]`        | Start interactive session            |
| `codex exec [PROMPT]`   | Run non-interactively                |
| `codex review [PROMPT]` | Run code review non-interactively    |
| `codex resume`          | Resume a previous session            |
| `codex mcp`             | Manage MCP servers                   |
| `codex mcp-server`      | Start Codex as an MCP server (stdio) |

## Code Review

```bash
# Review uncommitted changes (staged + unstaged + untracked)
codex review --uncommitted

# Review against a base branch
codex review --base main

# Review a specific commit
codex review --commit abc123

# Custom review instructions
codex review "Focus on security vulnerabilities" --uncommitted

# Review with a title
codex review --uncommitted --title "Feature: user auth"

# Pipe diff for review
git diff HEAD~3 | codex review -
```

## Non-Interactive Exec

```bash
# Basic exec
codex exec "Fix the type error in src/api.ts"

# With model override
codex exec -m gpt-5.4 "Refactor the auth module"

# Full-auto mode (sandboxed, approval on-request)
codex exec --full-auto "Add unit tests for utils.ts"

# Output last message to file
codex exec -o result.txt "Summarize the codebase"

# JSON output for scripting
codex exec --json "List all API endpoints"

# With image input
codex exec -i screenshot.png "Fix the UI bug shown in this screenshot"

# Change working directory
codex exec -C /path/to/project "Run the tests"
```

## Interactive Mode

```bash
# Default interactive
codex

# With full-auto sandbox (on-request approval + workspace-write)
codex --full-auto

# With specific model
codex -m gpt-5.4

# With web search enabled
codex --search

# With specific sandbox policy
codex -s read-only          # Read-only sandbox
codex -s workspace-write    # Can write to workspace
codex -s danger-full-access # Full disk access (dangerous)
```

## Sandbox & Approval Policies

| Sandbox Mode         | Description                |
| -------------------- | -------------------------- |
| `read-only`          | Cannot write to disk       |
| `workspace-write`    | Can write within workspace |
| `danger-full-access` | Full disk access           |

| Approval Policy | Description                                |
| --------------- | ------------------------------------------ |
| `untrusted`     | Only trusted commands run without approval |
| `on-request`    | Model decides when to ask                  |
| `never`         | Never ask (for non-interactive/CI)         |

```bash
# Explicit sandbox + approval
codex -s workspace-write -a never exec "Fix all lint errors"
```

## Configuration

Config file: `~/.codex/config.toml`

```bash
# Override config inline
codex -c model="gpt-5.4" -c 'sandbox_permissions=["disk-full-read-access"]'

# Use a config profile
codex -p my-profile exec "Do something"
```

## Useful Patterns

```bash
# Quick code review from Claude Code (second opinion)
codex review --uncommitted

# Review a PR branch
codex review --base main "Check for breaking API changes"

# Autonomous fix with sandbox
codex exec --full-auto "Fix all TypeScript errors in src/"

# Resume last session
codex resume --last
```
