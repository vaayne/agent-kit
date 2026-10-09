# Agent Kit

A Git repository for public agent configuration, skills, BB extensions, and
shared instructions. Claude Code and Codex configuration deploys from `config/`.
Skills sync to the BB server; `_AGENTS.md` provides shared instructions.

## Setup

Requires [mise](https://mise.jdx.dev/), Python 3.12+, and the agent CLIs you use.
Skills sync also needs `gh skill`, `rsync`, and SSH access for a remote target.

```bash
git clone https://github.com/vaayne/agent-kit.git
cd agent-kit

mise install             # install the tools declared by this repository

# Set the BB destination once per checkout. This local file is ignored by Git.
cat > .mise.local.toml <<'EOF'
[env]
BB_SKILLS_TARGET = "MacMini:/Users/vaayne/.bb-machines/vaayne-mbp.getbb.app/skills/"
EOF

mise run sync             # configuration, then instructions and skills
mise run sync:config      # Claude Code and Codex configuration
mise run sync:config -- --check  # check configuration without writing files
mise run sync:skills      # copy local and remote skills to BB
mise run sync:agents      # _AGENTS.md → CLAUDE.md / AGENTS.md symlinks for every framework
```

On each machine, update the checkout and sync it:

```bash
git pull --ff-only
mise run sync
```

Sync uses the checked-out files. It does not pull, commit, push, or run on a
schedule. Local source edits take effect on that machine; commit and push them
before other machines can pull the changes.

### Claude Code and Codex configuration

Edit public settings in `config/claude/` and `config/codex/`, then run
`mise run sync:config`. Claude settings, three role definitions, one routing
rule, and Codex settings deploy as individual files. Unrelated agents, rules,
skills, credentials, and session files remain in place. `CODEX_HOME` and
`CLAUDE_CONFIG_DIR` select a different destination when set.

Copies keep application writes separate from the Git source. Sync checks all
files before writing, backs up changed targets under
`~/.local/state/agent-kit/backups/`, and records a deployment baseline. It
refuses local edits or a differing file on a machine's first sync. Review and
reconcile the file with the repository, or run `mise run sync:config -- --replace`
to save a backup and apply the repository version. The replacement includes any
machine-specific fields in that managed file, so review provider settings first.
The script respects `XDG_STATE_HOME` for deployment state and backups. File
operations are logged to `~/.agents/sessions/agent-kit/logs/sync-config.log`.

To restore a backed-up file, read its target from `journal.json` and copy the
matching numbered file back to that target. Each journal entry's array index is
the backup filename; a null `before` means the target did not exist. Copy a
file back before the next sync if it needs further review.

Do not put tokens, login state, transcripts, or machine-specific provider
credentials in `config/`. Authentication is set up separately on each machine.
The script does not delete files removed from the repository. Remove a retired
agent or rule from HOME after reviewing it. Close settings editors before sync;
the checks do not provide a transaction against other processes.

Claude Code 2.1.293+ resolves the Haiku alias to Haiku 5.5. Opus owns the approach
and final review; Sonnet `worker` edits and tests at medium effort. Haiku `Explore`
and `researcher` use read-only tools at low effort. Opus 5.5 uses high effort,
and Fable is the configured advisor for substantial decisions and long tasks.
Codex settings preserve the imported local configuration.

In BB, Claude Code and Codex native subagents are disabled. BB Custom Instructions
manages delegation rules separately from this repository. BB's explicit model and effort can override
native defaults. Fable advisor calls
require account access, feature-flag fetching, and a compatible gateway. Some
plans require usage-credits consent through `/model fable`; then `/model opus`
returns to the main model. Configuration sync does not accept billing consent.

Restart Claude Code and Codex sessions after sync. For BB, stop an idle thread
and send its next message so the provider creates a process with the new files.

### BB server skills

Use the BB server's data directory, which `bb status --json` reports as
`dataDir`. A connected machine's `~/.bb` directory may belong to another server.
Set `BB_SKILLS_TARGET` in `.mise.local.toml`, or pass the destination directly.
The destination must end with `/skills/`. Use a local path when running on the
server, or an SSH destination when running on a connected machine:

```bash
mise run sync:skills
mise run sync:skills -- MacMini:/Users/vaayne/.bb-machines/vaayne-mbp.getbb.app/skills/
bb skill list --json
```

The existing `gh skill` flow installs or updates the entries in
`skills/remote-skills.txt`. Pinned tags and commits stay pinned. Downloads use
`~/.cache/agent-kit/bb-skills/`, with `XDG_CACHE_HOME` supported. The task combines
the selected remote skills with the local skills before copying them to BB.
If a remote operation fails or names collide, the task does not copy to BB.

BB provides these user skills to threads on its connected machines. Sync copies
scripts and references, preserves unrelated skills, and backs up overwritten
files under `<dataDir>/skill-backups/`. It does not delete retired skills or
files; review and remove them in BB. Existing sessions load new skill content
when their agent configuration is rebuilt. `sync:bb` is an alias for the same
flow.

Skills that call a CLI still need that CLI and its credentials on the execution
machine. Sync does not install skills into `~/.agents/skills` or
`~/.claude/skills`. Existing native copies from earlier syncs remain until they
are backed up and removed. For agents running outside BB, install the required
skills separately.

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

Remote skills installed during sync (see [skills/remote-skills.txt](skills/remote-skills.txt)): **skill-creator**, **gh-stack**, **herdr**, **bento-slides**, **tailscale**, **use-modern-go**, **grilling**, **documd-visuals**.

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
├── config/       # Public Claude Code and Codex configuration
├── skills/       # Local skills + remote-skills.txt registry
└── bb-extensions/   # BB plugins
```

## License

[MIT](./LICENSE)
