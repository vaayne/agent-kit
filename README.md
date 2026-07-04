# Agent Kit

A curated collection of skills, extensions, and instructions for AI coding agents. Skills sync to a shared `~/.agents/skills` directory and are symlinked into Claude Code, Pi, Codex, and other runtimes; `_AGENTS.md` is the single instruction file linked to all of them.

## Setup

Requires [mise](https://mise.jdx.dev/).

```bash
git clone --recursive https://github.com/vaayne/agent-kit.git
cd agent-kit
mise run setup        # submodules, dependencies

mise run sync             # everything: skills + instructions + extensions
mise run sync:skills      # local + remote skills → ~/.agents/skills, symlinked into each runtime
mise run sync:agents      # _AGENTS.md → CLAUDE.md / AGENTS.md symlinks for every framework
mise run sync:extensions  # Pi extensions → ~/.pi/agent/extensions symlinks
```

## Development workflow skills

The core of the kit is a development lifecycle where every step is an independently invocable skill, and `spec-dev` is the thin orchestrator over them:

```
scout → grill → blueprint → mason → code-review → teach
探地形    拷问     画图纸      施工      审计         内化
```

| Skill           | Role                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| **scout**       | Find your unknowns before they get expensive — blindspot pass, prototypes, references, quadrant diagnostic |
| **grill**       | Stress-test an idea through structured interrogation, one question at a time                               |
| **blueprint**   | Write a decision-first `plan.md` — decisions with tradeoffs, phased tasks with acceptance blocks           |
| **mason**       | Execute a `plan.md` phase by phase: catch up → implement → verify → commit → handoff                       |
| **code-review** | Multi-perspective adversarial review with verifier subagents and near-zero false positives                 |
| **teach**       | Socratic quiz loop — merge only what you can pass a quiz on                                                |
| **spec-dev**    | The orchestrator: sequence, review gates, and skip rules over the skills above                             |
| **conductor**   | Mode for expensive models: architect and verify here, delegate all execution to codex                      |
| **delegate**    | Run a self-contained task in a separate agent session (Claude Code or Pi, auto-routed by model name)       |
| **refine-code** | Improve existing code without changing behavior — simplify, deepen abstractions, reduce complexity         |
| **handoff**     | Transfer context to a fresh focused session                                                                |

## Tool & service skills

| Skill               | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| **curator**         | Maintain the nmem knowledge base — lint + synthesis passes           |
| **tap-web**         | Web access, search, extraction, and browser automation via `tap`     |
| **designer**        | Distinctive UI/UX design and prototypes for filesystem-backed agents |
| **humanizer**       | Strip AI writing patterns from prose                                 |
| **kreuzberg**       | Extract text/tables/metadata from 91+ document formats               |
| **python-script**   | Robust Python automation with logging and safety checks              |
| **vertex-ai-image** | Image generation, editing, and understanding via Google Gemini       |
| **cf-email**        | Send email through the Cloudflare Email Sending API                  |
| **gws**             | Google Workspace operations via the `gws` CLI                        |
| **lark**            | Lark/Feishu workspace operations via `lark-cli`                      |
| **openlist**        | Manage files on OpenList/AList cloud storage                         |

Remote skills installed during sync (see [skills/remote-skills.txt](skills/remote-skills.txt)): **skill-creator**, **mcp-skill-gen**, **native-feel-skill**.

## Extensions (Pi)

| Extension              | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| **delegate**           | Delegate tasks to specialized presets                          |
| **cliproxy-provider**  | Register a `cliproxy` provider from a `/v1/models` endpoint    |
| **firework-provider**  | Fireworks provider with router model and tool-field sanitizing |
| **codex-usage-status** | Show Codex usage windows in the status line                    |
| **notify**             | Play a sound when the agent finishes a task                    |

Delegate presets: **librarian** (code research), **oracle** (architecture analysis), **reviewer** (correctness/risk review), **search** (fast retrieval), **ui-engineer** (visual/UI), **worker** (general execution).

## Project structure

```
agent-kit/
├── _AGENTS.md    # Shared agent instructions, symlinked to every framework
├── skills/       # Local skills + remote-skills.txt registry
├── extensions/   # Pi extensions
└── mcphub        # MCP hub (submodule)
```

## License

[MIT](./LICENSE)
