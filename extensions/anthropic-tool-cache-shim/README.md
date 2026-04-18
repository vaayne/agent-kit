# Anthropic Tool Cache Shim

A Pi extension that patches outgoing `anthropic-messages` requests for selected incompatible providers and removes `tools[*].cache_control` from the payload. The bundled scope currently targets Fireworks.

This is useful for Anthropic-compatible proxies that lag behind Anthropic's request schema changes. The motivating case is Fireworks rejecting requests like:

```text
Error: 400 {"error":{"type":"invalid_request_error","message":"Extra inputs are not permitted, field: 'tools[7].cache_control'"},"type":"error"}
```

## What it does

- Keeps your existing provider and model selection unchanged
- Intercepts outgoing `anthropic-messages` payloads right before the request is sent
- Removes `cache_control` from every tool definition
- Leaves message and system prompt cache hints untouched

## Current scope

The shim is intentionally code-configured, not env-configured.

It currently applies to these providers:

- `fireworks`

If you need another Anthropic-compatible proxy, add its provider name to `STRIP_TOOL_CACHE_PROVIDERS` in `index.ts` in your local checkout or fork.

## Installation

```bash
pi install /absolute/path/to/agent-kit/extensions/anthropic-tool-cache-shim
```

Or install from git/npm once published through your normal Pi package flow.

## Usage

1. Configure your Anthropic-compatible provider as usual
2. Install this extension
3. Start Pi normally
4. Use the provider's regular model in `/model`

No extra environment variables are required, and no shadow provider or cloned models are created.
