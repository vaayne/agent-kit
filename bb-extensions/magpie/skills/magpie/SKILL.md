---
name: magpie
description: Configure the BB Magpie connector, sync its Pi extension, and route BB Codex or Claude Code threads through a Magpie gateway.
---

# BB Magpie connector

Use `bb magpie` to inspect and configure the connector. Use the separate `magpie` CLI or Magpie UI to manage gateway accounts and models.

## Inspect

- `bb magpie status` shows the gateway, routing settings, sync state, and host installations.
- `bb magpie check --native` checks the gateway without requiring Pi configuration.
- `bb magpie check` also validates the Pi model catalog on the BB server.
- Checks do not send model requests.

## Monitor

Open Magpie in the BB navigation rail for Gateway, Routing, and Usage. Visible pages refresh every 5 seconds; snapshots are shared for up to 5 seconds. Usage offers Today, 7 days, and 30 days, using the Magpie server's time zone. Costs are model-price estimates, not invoices.

- Health and usage read the configured gateway. A restricted gateway key may be refused the global usage summary.
- Subscriptions and provider status need `webUrl` and secret `webKey` in plugin settings. Optional `webLink` sets the browser URL for Open Magpie Web. `webUrl` is an HTTP(S) origin reached by the BB server. Use the fixed `MAGPIE_WEB_KEY` when available. Never print keys or put them in command arguments.
- The Web UI must own the gateway for live routing traces. The page reports when another process owns it.
- Monitoring is read-only. It does not expose Web UI credentials, request bodies, session IDs, or raw upstream errors to the browser.

## Configure

- `gatewayUrl` is the gateway origin as reached from the BB server. The default is `http://127.0.0.1:3425`.
- Set `gatewayKey` through the plugin settings when the gateway requires authentication. Do not print keys.
- `piAgentDir` selects the source Pi directory on the server. Each host uses its own `PI_CODING_AGENT_DIR` or `~/.pi/agent`.
- `autoSync` is off for new installations. When enabled, it syncs all persistent machines every 30 seconds and reloads Pi when its threads are idle.

Use `bb plugin config magpie set <setting> <value>` for non-secret settings.

## Pi changes

`bb magpie sync --machine <name-or-id>` installs the managed extension and changes Pi's default provider, default model, and enabled models. Without `--machine`, it selects all connected persistent machines. Select hosts within the user's requested scope. Sync also replaces the Magpie entries in BB `customModels` for the Codex and Claude Code pickers. `--machine` limits only the Pi part. The Magpie panel's **Sync models** button runs the same sync.

After manual sync, run `bb plugin reload provider-pi` when Pi threads are idle. Start a new Pi session. The generated extension needs BB session environment variables for model requests; it is not a standalone Pi package.

`bb magpie remove --machine <name-or-id>` restores saved Pi settings unless the user has since changed them. It also excludes that host from automatic sync. Removal without `--machine` turns off automatic sync. Check every host result before disabling or uninstalling the plugin.

## Native routing

`bb magpie route <thread-id>` enables routing for one native Codex or Claude Code thread. `--off` disables that thread's route. These settings override the global setting.

`bb magpie routing codex` or `bb magpie routing claude` enables a global route. Add `--off` to disable it. Changes apply on the next turn. If Account Pooler is enabled, bypass the selected thread or disable its global route for the same provider to avoid conflicting environment settings.
