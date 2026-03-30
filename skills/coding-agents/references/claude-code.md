# Claude Code CLI Reference

Canonical command: `claude`. Local alias `cc` wraps it with Bedrock + bypass permissions.

> **Prefer acpx**: Most tasks can use `acpx claude exec "..."` or `acpx claude "..."` for unified session management. Use direct CLI below for advanced features (worktree mode, session forking, permission modes, MCP tools).

## Local cc Alias

```bash
cc() {
  unset ANTHROPIC_API_KEY
  unset ANTHROPIC_AUTH_TOKEN
  CLAUDE_CODE_USE_BEDROCK=1 AWS_PROFILE=dev AWS_REGION=us-west-2 \
    claude --dangerously-skip-permissions "$@"
}
```

> All examples below use `claude` directly. Substitute `cc` when the alias is available.

## Non-Interactive Print Mode

```bash
claude -p "Explain what src/index.ts does"
git diff | claude -p "Review this diff for bugs"

# Model selection
claude --model opus -p "Refactor this function for readability"
claude --model sonnet -p "Quick summary of this file"
claude --model haiku -p "List all exports"

# Guardrails
claude -p --max-budget-usd 1.00 "Comprehensive code review of src/"
claude -p --max-turns 5 "Fix lint errors and run tests"

# Output formats
claude -p --output-format json "List all exported functions in src/"
claude -p --output-format stream-json "Analyze this codebase"

# System prompt
claude -p --system-prompt "You are a security auditor" "Review src/auth.ts"
claude -p --append-system-prompt "Focus on performance" "Review src/api.ts"
```

## Interactive Mode

```bash
claude                        # Default interactive
claude -c                     # Continue last conversation
claude -r                     # Resume picker
claude -r <session-id>        # Resume specific session
claude -n "feature-auth"      # Named session

# Models (aliases: opus, sonnet, haiku)
claude --model opus           # Most capable, complex tasks
claude --model sonnet         # Balanced speed/quality
claude --model haiku          # Fastest, simple tasks

# Effort
claude --effort high
claude --effort max

# Scoping
claude --tools "Bash,Read,Grep"
claude --add-dir ../shared-lib
```

## Worktree Mode

```bash
claude -w                     # Isolated git worktree
claude -w feature-branch      # Named worktree
claude -w --tmux              # Worktree with tmux
```

## Permission Modes

| Mode                | Description                              |
| ------------------- | ---------------------------------------- |
| `default`           | Ask for approval on risky actions        |
| `plan`              | Read-only, no edits allowed              |
| `acceptEdits`       | Auto-accept file edits, ask for commands |
| `dontAsk`           | Never ask, fail silently on denied tools |
| `bypassPermissions` | Skip all permission checks               |
| `auto`              | Auto-approve within safety guardrails    |

```bash
claude --permission-mode plan -p "Analyze this codebase"
claude --permission-mode auto
```

## Session Management

```bash
claude -c                                          # Continue last
claude -r                                          # Resume picker
claude -r "auth feature"                           # Resume with search
claude -r <id> --fork-session                      # Fork a session
claude --from-pr 123                               # Resume from PR
claude --from-pr https://github.com/org/repo/pull/123
```

## Useful Patterns

```bash
git diff main | claude -p "Review this diff"
claude --model sonnet -p "Review src/auth.ts for security issues"
claude --permission-mode plan -p "Explain the architecture"
claude -w -p "Run tests and fix any failures"
claude -p --json-schema '{"type":"object","properties":{"issues":{"type":"array","items":{"type":"string"}}}}' "List issues"
```
