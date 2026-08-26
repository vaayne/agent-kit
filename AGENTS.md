# Agent Instructions

`_AGENTS.md` is the shared instruction file this repo ships to every framework. It is
not this file's job to restate it; read it directly when working on its content.

## Layout

- `skills/` — local skills, one directory per skill, plus `remote-skills.txt`
- `pi-extensions/` — Pi extensions, linked into `~/.pi/agent/extensions` by `mise run sync`
- `.mise/tasks/sync/skills` — the skill sync script; everything else lives in `mise.toml`

## Commands

- `mise run format` — dprint across TS/JSON/YAML/TOML/Markdown/HTML and ruff for Python
- `mise run sync` — link skills, instructions, and extensions into the local frameworks

`mise run sync` runs `format` at the end, so a sync can leave formatting changes in the
working tree. Commit them separately.

## Code style

- **Python:** 3.12+, ruff (88-char lines, double quotes), snake_case, type hints required
- **TypeScript:** strict mode, camelCase functions, PascalCase types, Zod for validation
