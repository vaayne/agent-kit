# Subagent Extension

A Pi extension that delegates tasks to specialized agents in isolated contexts.

## Tool

### `subagent`

Delegate tasks to specialized agents. Spawns a separate `pi` process for each invocation with isolated context.

## Slash Commands

The extension also registers command shortcuts for quick single-agent execution:

- `/agents <agent> <task>`
- `/agents:<agent> <task>` for agent names containing only letters, numbers, `.`, `_`, or `-`

Examples:

```text
/agents reviewer Audit the current diff for correctness risks
/agents:worker Implement a changelog entry for the latest feature
```

These shortcuts discover both user and project-local agents. Project-local agents still require confirmation in the TUI before they run.

## Modes

### Single Mode

Run one agent with one task.

```json
{
  "agent": "worker",
  "task": "List all files in the current directory"
}
```

### Parallel Mode

Run multiple agents concurrently.

```json
{
  "tasks": [
    { "agent": "worker", "task": "Task 1" },
    { "agent": "worker", "task": "Task 2" }
  ]
}
```

### Chain Mode

Run agents sequentially, passing output to the next step via `{previous}` placeholder.

```json
{
  "chain": [
    { "agent": "worker", "task": "Generate a list of items" },
    { "agent": "worker", "task": "Process these items: {previous}" }
  ]
}
```

## Parameters

| Name                   | Type    | Required | Description                                            |
| ---------------------- | ------- | -------- | ------------------------------------------------------ |
| `agent`                | string  | No       | Agent name (for single mode)                           |
| `task`                 | string  | No       | Task description (for single mode)                     |
| `tasks`                | array   | No       | Array of `{agent, task}` (for parallel mode)           |
| `chain`                | array   | No       | Array of `{agent, task}` (for chain mode)              |
| `cwd`                  | string  | No       | Working directory for the agent                        |
| `agentScope`           | string  | No       | `user`, `project`, or `both` (default: `user`)         |
| `confirmProjectAgents` | boolean | No       | Prompt before running project agents (default: `true`) |

## Agent Discovery

Agents are discovered from:

- **User agents:** `~/.pi/agent/agents/`
- **Project agents:** `.pi/agents/` (in project root)
