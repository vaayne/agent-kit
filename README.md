# Agent Kit

A curated collection of skills, BB plugins, and instructions for AI coding agents. Skills sync to a shared `~/.agents/skills` directory and are symlinked into Claude Code, Pi, Codex, and other runtimes; `_AGENTS.md` is the single instruction file linked to all of them.

## Setup

Requires [mise](https://mise.jdx.dev/).

```bash
git clone https://github.com/vaayne/agent-kit.git
cd agent-kit

mise run sync             # everything: skills + instructions
mise run sync:skills      # link local skills + install remote skills in ~/.agents/skills
mise run sync:agents      # _AGENTS.md → CLAUDE.md / AGENTS.md symlinks for every framework
```

## Development workflow skills

The kit's workflow skills each stand alone — pick the one that fits the moment:

| Skill           | Role                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **scout**       | Find your unknowns before they get expensive — blindspot pass, prototypes, references, quadrant diagnostic                    |
| **grill**       | Stress-test an idea through structured interrogation — a decision tree worked frontier-first, in rounds                       |
| **code-review** | Evidence-based code review; use independent reviewers and report bundles when depth or risk warrants                          |
| **teach**       | Socratic quiz loop — merge only what you can pass a quiz on                                                                   |
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
└── bb-extensions/   # BB plugins
```

## License

[MIT](./LICENSE)
