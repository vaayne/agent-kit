# Delegate Extension

A Pi extension that delegates work to specialized presets in isolated contexts.

## Tool

### `delegate`

Delegate work to a specialized preset. Each invocation spawns a separate `pi` process with its own isolated context and persistent session.

## Slash Commands

The extension registers these slash commands:

- `/delegate <name> <prompt>`
- `/delegate-resume <session-id> <prompt>`
- `/delegate-swarm <task>`

Example:

```text
/delegate reviewer Audit the current diff for correctness risks
```

The slash command does not run the preset directly. It sends a user message instructing the main agent to rewrite the raw request into a self-contained prompt, call the `delegate` tool with `options.scope: "both"`, and integrate the result.

## Built-in Presets

Built-in presets live in `presets/` inside this extension:

- `librarian`
- `oracle`
- `reviewer`
- `search`
- `ui-engineer`
- `worker`

## Modes

### Single Run

```json
{
  "name": "worker",
  "prompt": "List all files in the current directory"
}
```

Override the preset's default model at runtime:

```json
{
  "name": "reviewer",
  "prompt": "Audit the current diff for correctness risks",
  "options": {
    "model": "openai-codex/gpt-5.5",
    "thinking": "high"
  }
}
```

### Resume a Saved Session

```json
{
  "sessionId": "019d906a-3d5a-70b6-a359-1d16acea15dc",
  "prompt": "Continue the review and focus on race conditions"
}
```

### Parallel Runs

```json
{
  "parallel": [
    { "name": "worker", "prompt": "Task 1" },
    { "name": "reviewer", "prompt": "Task 2" }
  ]
}
```

### Sequence Runs

```json
{
  "sequence": [
    { "name": "worker", "prompt": "Generate a list of items" },
    { "name": "reviewer", "prompt": "Process these items: {previous}" }
  ]
}
```

## Parameters

| Name        | Type   | Required | Description                                                            |
| ----------- | ------ | -------- | ---------------------------------------------------------------------- |
| `name`      | string | No       | Preset name for a single run                                           |
| `sessionId` | string | No       | Saved delegate session ID to resume                                    |
| `prompt`    | string | No       | Prompt for a single run or resumed session                             |
| `parallel`  | array  | No       | Array of `{name, prompt, cwd?, model?, thinking?}` for parallel runs   |
| `sequence`  | array  | No       | Array of `{name, prompt, cwd?, model?, thinking?}` for sequential runs |
| `options`   | object | No       | Optional configuration                                                 |

Tool results include a per-run `sessionId` in `details.results[]`. Use that ID with the `delegate` tool's resume mode or `/delegate-resume` to continue the same specialized preset later.

### `options`

| Name             | Type    | Required | Description                                             |
| ---------------- | ------- | -------- | ------------------------------------------------------- |
| `scope`          | string  | No       | `user`, `project`, or `both` (default: `user`)          |
| `confirmProject` | boolean | No       | Prompt before running project presets (default: `true`) |
| `cwd`            | string  | No       | Working directory for a single run                      |
| `model`          | string  | No       | Default model override for the whole tool call          |
| `thinking`       | string  | No       | Default thinking override                               |

## Model Profiles

Presets should declare a stable `modelProfile` instead of a concrete model name:

```yaml
---
name: reviewer
description: Code reviewer focused on correctness, risk, and actionable feedback
modelProfile: reason
thinking: medium
---
```

Supported profiles are `quick`, `build`, `reason`, and `design`. Configure their models with environment variables:

```bash
export PI_DELEGATE_QUICK_MODEL="<model>"
export PI_DELEGATE_BUILD_MODEL="<model>"
export PI_DELEGATE_REASON_MODEL="<model>"
export PI_DELEGATE_DESIGN_MODEL="<model>"
```

Optional thinking overrides use the same profile names:

```bash
export PI_DELEGATE_QUICK_THINKING="low"
export PI_DELEGATE_BUILD_THINKING="medium"
export PI_DELEGATE_REASON_THINKING="high"
export PI_DELEGATE_DESIGN_THINKING="medium"
```

If a profile used by a discovered preset has no model env configured, the extension shows a TUI warning on session start. Tool parameters still take precedence over profile env values.

## Preset Discovery

Presets are discovered from:

- **Built-in presets:** `extensions/delegate/presets/`
- **User presets:** `~/.pi/agent/delegate-presets/`
- **Project presets:** `.pi/delegate-presets/` (nearest parent of the current working directory)

Built-in presets are always loaded first. User and project presets with the same name override built-ins when their scope is enabled.
