# Cliproxy Provider

A Pi extension that registers a `cliproxy` provider from a Cliproxy-compatible `/v1/models` endpoint.

## What it does

- Requires both `CLIPROXY_BASE_URL` and `CLIPROXY_API_KEY` to be set
- Skips provider registration when either environment variable is missing
- Fetches the model list from `${CLIPROXY_BASE_URL}/v1/models`
- Registers the fetched models under the `cliproxy` provider
- Uses Pi's `anthropic-messages` API mode
- Caches the model list for 1 hour at `~/.cache/pi/cliproxy-models.json`
- Falls back to stale cache for the same base URL if a refresh fails

## Installation

```bash
pi install /absolute/path/to/agent-kit/extensions/cliproxy-provider
```

Or install from git/npm once published through your normal Pi package flow.

## Usage

1. Set the required environment variables:

   ```bash
   export CLIPROXY_BASE_URL="https://your-cliproxy.example.com"
   export CLIPROXY_API_KEY="your-api-key"
   ```

2. Install this extension.
3. Restart Pi or run `/reload`.
4. Select Cliproxy models from `/model`.

If either environment variable is missing, the extension exits without registering the provider.

## Model cache

The model cache is stored at:

```text
~/.cache/pi/cliproxy-models.json
```

The cache is scoped to `CLIPROXY_BASE_URL`, so changing the base URL forces a fresh model fetch.
