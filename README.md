# Agent Kit

A curated collection of skills, extensions, and tools for AI coding agents. Works with [Pi](https://github.com/mariozechner/pi), Claude Code, and other AI assistants.

## Installation

### As a Pi Package

```bash
# Install from git
pi install git:github.com/vaayne/agent-kit

# Or add to your settings.json
{
  "packages": ["git:github.com/vaayne/agent-kit"]
}
```

### Manual Sync

```bash
git clone https://github.com/vaayne/agent-kit.git
cd agent-kit

mise run sync:pi            # Sync to ~/.pi/agent
mise run sync:claude:skills # Sync to ~/.claude/skills
mise run sync:codex:skills  # Sync to ~/.codex/skills
```

## What's Included

### Skills (13)

Task-specific instructions that guide AI agents on how to approach different problems.

| Skill                    | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| **changelog-automation** | Automate changelog generation from commits and PRs     |
| **document-writer**      | Craft clear technical documentation and README files   |
| **frontend-design**      | Create production-grade UI with high design quality    |
| **mcp-context7-docs**    | Query up-to-date library documentation                 |
| **mcp-exa-search**       | Web search and company research via Exa AI             |
| **mcp-grep-code**        | Search real-world code examples from GitHub            |
| **mcp-jetbrains-ide**    | Control JetBrains IDEs via MCP                         |
| **mcp-skill-gen**        | Generate skills from MCP servers                       |
| **python-script**        | Create robust Python automation scripts                |
| **react-best-practices** | React/Next.js performance optimization guidelines      |
| **specs-dev**            | Plan-first development with review gates               |
| **ui-skills**            | Opinionated constraints for building better interfaces |
| **web-fetch**            | Fetch and extract content from URLs                    |

### Extensions (4)

Pi extensions that add new capabilities to the agent.

| Extension            | Description                                       |
| -------------------- | ------------------------------------------------- |
| **mcp**              | MCP client integration with tool orchestration    |
| **subagent**         | Delegate tasks to specialized subagents           |
| **notify**           | System notifications for long-running tasks       |
| **powerline-status** | Rich status line with git, time, and context info |

### Subagents (4)

Specialized agents for delegation via the subagent extension.

| Agent           | Description                                         |
| --------------- | --------------------------------------------------- |
| **librarian**   | Code research across repositories and documentation |
| **oracle**      | Architecture decisions and deep technical analysis  |
| **ui-engineer** | Visual/UI/UX implementation specialist              |
| **worker**      | General-purpose task execution                      |

## Project Structure

```
agent-kit/
├── skills/           # Task-specific instructions (Pi, Claude Code)
├── extensions/       # Pi extensions
├── agents/           # Subagent definitions (Pi)
├── claude-plugins/   # Claude Code slash commands
├── mcps/             # MCP servers
└── package.json      # Pi package manifest
```

## Development

Requires [mise](https://mise.jdx.dev/) for task running.

```bash
mise install      # Setup tools
mise run format   # Format all code
```

## Claude Code Plugin Marketplace

```bash
/plugin marketplace add vaayne/agent-kit
```

## License

[MIT](./LICENSE)
