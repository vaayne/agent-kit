# Agent Kit

A curated collection of skills, Pi extensions, BB plugins, and instructions for AI coding agents. Skills sync to a shared `~/.agents/skills` directory and are symlinked into Claude Code, Pi, Codex, and other runtimes; `_AGENTS.md` is the single instruction file linked to all of them.

## Setup

Requires [mise](https://mise.jdx.dev/).

```bash
git clone https://github.com/vaayne/agent-kit.git
cd agent-kit

mise run sync             # everything: skills + instructions + extensions
mise run sync:skills      # link local skills + install remote skills in ~/.agents/skills
mise run sync:agents      # _AGENTS.md → CLAUDE.md / AGENTS.md symlinks for every framework
mise run sync:extensions  # Pi extensions → ~/.pi/agent/extensions symlinks
```

## Development workflow skills

The core of the kit is a development lifecycle where every step is an independently invocable skill, and `spec-dev` is the thin orchestrator over them:

```
scout → grill → blueprint → mason → code-review → teach
探地形    拷问     画图纸      施工      审计         内化
```

| Skill           | Role                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **scout**       | Find your unknowns before they get expensive — blindspot pass, prototypes, references, quadrant diagnostic                    |
| **grill**       | Stress-test an idea through structured interrogation — a decision tree worked frontier-first, in rounds                       |
| **blueprint**   | Write a decision-first `plan.md` — decisions with tradeoffs, phased tasks with acceptance blocks                              |
| **mason**       | Execute a `plan.md` phase by phase: catch up → implement → verify → commit → handoff                                          |
| **code-review** | Multi-perspective adversarial review with verifier subagents and near-zero false positives                                    |
| **teach**       | Socratic quiz loop — merge only what you can pass a quiz on                                                                   |
| **spec-dev**    | The orchestrator: sequence, review gates, and skip rules over the skills above                                                |
| **refine-code** | Improve existing code without changing behavior — Code, Architecture, and Entropy modes: sharpen, deepen, or prove-and-delete |
| **handoff**     | Transfer context to a fresh focused session                                                                                   |

## Tool & service skills

| Skill             | Description                                                |
| ----------------- | ---------------------------------------------------------- |
| **curator**       | Maintain the nmem knowledge base — lint + synthesis passes |
| **humanizer**     | Strip AI writing patterns from prose                       |
| **python-script** | Robust Python automation with logging and safety checks    |
| **cf-email**      | Send email through the Cloudflare Email Sending API        |
| **gws**           | Google Workspace operations via the `gws` CLI              |
| **lark-cli**      | Lark/Feishu workspace operations via `lark-cli`            |
| **openlist**      | Manage files on OpenList/AList cloud storage               |

Remote skills installed during sync (see [skills/remote-skills.txt](skills/remote-skills.txt)): **skill-creator**, **gh-stack**, **herdr**, **bento-slides**, **tailscale**, **diagram-design**.

## Extensions (Pi)

| Extension                       | Description                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------ |
| **auto-continue-after-compact** | Continue the task automatically after a threshold compaction                   |
| **generic-provider**            | Register configurable API providers from `auth.json`, enriched with models.dev |
| **codex-usage-status**          | Show Codex usage windows in the status line                                    |
| **model-context**               | Tell the agent its active Pi model without changing the prompt                 |

## BB extensions

| Extension               | Description                                                   |
| ----------------------- | ------------------------------------------------------------- |
| **workspace-navigator** | Browse projects, worktrees, and sessions in a compact sidebar |

Install the Workspace Navigator from this repository with:

```bash
npm --prefix bb-extensions/workspace-navigator install
bb plugin install ./bb-extensions/workspace-navigator --yes
```

## Project structure

```
agent-kit/
├── _AGENTS.md    # Shared agent instructions, symlinked to every framework
├── skills/       # Local skills + remote-skills.txt registry
├── pi-extensions/   # Pi extensions
└── bb-extensions/   # BB plugins
```

### Generic Pi providers

`generic-provider.ts` reads all provider configuration from
`~/.pi/agent/generic-provider.json`; matching entries in `auth.json` are neither
required nor consulted. Keep this file private because it contains API keys.

```json
{
  "providers": {
    "my-gateway": {
      "baseUrl": "https://gateway.example.com/v1",
      "apiKey": "sk-...",
      "api": "openai-responses",
      "models": {
        "include": ["gpt-*", "claude-sonnet-*"],
        "exclude": ["*-preview"],
        "overrides": {
          "gpt-custom": {
            "contextWindow": 128000,
            "maxTokens": 32000,
            "reasoning": true,
            "thinkingLevelMap": {
              "minimal": "low",
              "xhigh": "xhigh"
            }
          }
        }
      }
    }
  }
}
```

`api` supports `openai-responses`, `openai-completions`, and
`anthropic-messages`, and defaults to `openai-responses`. OpenAI providers use
`{baseUrl}/models`; Anthropic providers use `{baseUrl}/v1/models`. The provider
model-list response remains the availability source, then pricing, context
limits, and modalities are enriched from models.dev. `include` and `exclude`
accept `*` and `?` globs. Overrides are keyed by exact model ID and apply last,
including when the discovered list came from the local cache.

## License

[MIT](./LICENSE)
