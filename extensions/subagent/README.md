# Agent Extension

A Pi extension that delegates work to specialized agents in isolated contexts.

## Tool

### `agent`

Delegate work to a specialized agent. Each invocation spawns a separate `pi` process with its own isolated context and persistent session.

## Slash Command

The extension registers one slash command:

- `/agent <name> <prompt>`

Example:

```text
/agent reviewer Audit the current diff for correctness risks
```

This command does not run the subagent directly. Instead, it sends a user message that instructs the main agent to:

- rewrite the raw request into a self-contained, context-aware subagent prompt
- include relevant conversation, repository, working-directory, file, and constraint context
- call the `agent` tool with `options.scope: "both"`
- integrate the subagent result back into the normal conversation flow

This keeps the UI consistent with normal tool usage and ensures subagent output returns through the main agent.

## Modes

### Single Run

Run one agent with one prompt.

```json
{
  "name": "worker",
  "prompt": "List all files in the current directory"
}
```

Override the agent's default model at runtime:

```json
{
  "name": "reviewer",
  "prompt": "Audit the current diff for correctness risks",
  "options": {
    "model": "openai-codex/gpt-5.4",
    "thinking": "high"
  }
}
```

### Parallel Runs

Run multiple agents concurrently.

```json
{
  "parallel": [
    { "name": "worker", "prompt": "Task 1" },
    { "name": "reviewer", "prompt": "Task 2" }
  ]
}
```

Per-run overrides are also supported in parallel mode:

```json
{
  "parallel": [
    {
      "name": "worker",
      "prompt": "Task 1",
      "model": "google/gemini-2.5-pro",
      "thinking": "medium"
    },
    {
      "name": "reviewer",
      "prompt": "Task 2",
      "model": "openai-codex/gpt-5.4",
      "thinking": "high"
    }
  ]
}
```

### Sequence Runs

Run agents sequentially, passing output to the next step via `{previous}`.

```json
{
  "sequence": [
    { "name": "worker", "prompt": "Generate a list of items" },
    { "name": "reviewer", "prompt": "Process these items: {previous}" }
  ]
}
```

## Parameters

| Name       | Type   | Required | Description                                                            |
| ---------- | ------ | -------- | ---------------------------------------------------------------------- |
| `name`     | string | No       | Agent name for a single run                                            |
| `prompt`   | string | No       | Prompt for a single run                                                |
| `parallel` | array  | No       | Array of `{name, prompt, cwd?, model?, thinking?}` for parallel runs   |
| `sequence` | array  | No       | Array of `{name, prompt, cwd?, model?, thinking?}` for sequential runs |
| `options`  | object | No       | Optional configuration                                                 |

Tool results include a per-run `sessionId` in `details.results[]`, which can be used later with `pi --session <id>` to resume a subagent session.

### `options`

| Name             | Type    | Required | Description                                                   |
| ---------------- | ------- | -------- | ------------------------------------------------------------- |
| `scope`          | string  | No       | `user`, `project`, or `both` (default: `user`)                |
| `confirmProject` | boolean | No       | Prompt before running project agents (default: `true`)        |
| `cwd`            | string  | No       | Working directory for a single run                            |
| `model`          | string  | No       | Default model override for the whole tool call                |
| `thinking`       | string  | No       | Default thinking override: `off|minimal|low|medium|high|xhigh` |

## Agent Discovery

Agent frontmatter may define default `model` and `thinking`, but both can now be overridden at runtime through tool parameters.

Agents are discovered from:

- **User agents:** `~/.pi/agent/agents/`
- **Project agents:** `.pi/agents/` (in project root)
