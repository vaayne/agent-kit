# Firework Provider

A Pi extension that overrides Pi's built-in `fireworks` provider with a single Fireworks router model configured for Anthropic-compatible request quirks.

The motivating failure is Fireworks rejecting Anthropic tool definitions that Pi's built-in provider currently sends:

```text
Error: 400 {"error":{"type":"invalid_request_error","message":"Extra inputs are not permitted, field: 'tools[0].eager_input_streaming'; Extra inputs are not permitted, field: 'tools[4].cache_control'"},"type":"error"}
```

## What it does

- Re-registers only `accounts/fireworks/routers/kimi-k2p5-turbo` under the same `fireworks` provider name
- Keeps the standard `FIREWORKS_API_KEY` environment variable
- Marks Fireworks models as not supporting Anthropic per-tool eager input streaming
- Patches outgoing Fireworks Anthropic payloads right before request dispatch
- Removes unsupported fields from every tool definition:
  - `tools[*].eager_input_streaming`
  - `tools[*].cache_control`

Message and system prompt cache hints are left untouched; only tool definitions are sanitized.

## Installation

```bash
pi install /absolute/path/to/agent-kit/extensions/firework-provider
```

Or install from git/npm once published through your normal Pi package flow.

## Usage

1. Set `FIREWORKS_API_KEY`
2. Install this extension
3. Restart Pi or run `/reload`
4. Use the normal Fireworks models in `/model`

No shadow provider is created. After this override, the Fireworks provider only exposes `fireworks/accounts/fireworks/routers/kimi-k2p5-turbo`.
