# Agent Instructions

`_AGENTS.md` is the shared instruction file this repo ships to every framework. It is
not this file's job to restate it; read it directly when working on its content.

## Layout

- `skills/` — local skills, one directory per skill, plus `remote-skills.txt`
- `config/claude/` and `config/codex/` — public configuration, agents, and rules
- `.mise/tasks/sync/` — configuration, skill, and BB server sync tasks
- `scripts/sync_config.py` — configuration deployment with backups and a baseline

## Commands

- `mise run format` — dprint across TS/JSON/YAML/TOML/Markdown/HTML and ruff for Python
- `mise run sync` — format, copy configuration, link instructions, and sync skills to BB
- `mise run sync:skills` — copy local and remote skills to `BB_SKILLS_TARGET`
- `mise run sync:config -- --check` — check configuration without writing files
- `"$(mise which python3)" -m unittest discover -s tests -v` — configuration and skill sync tests

Keep tokens, login state, transcripts, and machine-specific provider settings out
of `config/`. Configuration sync uses copies, backs up changes, and refuses local
edits. Review those edits before using `--replace`.

`mise run sync` runs `format` first, so a sync can leave formatting changes in the
working tree. Commit them separately.

## Code style

- **Python:** 3.12+, ruff (88-char lines, double quotes), snake_case, type hints required
- **TypeScript:** strict mode, camelCase functions, PascalCase types, Zod for validation
