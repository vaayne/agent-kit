# Agent Instructions

## Build/Lint/Test Commands

- `mise run format` — Format all code (ruff for Python, dprint for TS/JSON/YAML/MD)

## Architecture

- `plugins/` — Claude Code plugins
- `extensions/` — pi extensions
- `skills/` — Agent skills

## Marketplace

- When adding new plugins or skills, update `.claude-plugin/marketplace.json` to register them

## Code Style

- **Python:** Python 3.12+, ruff (88-char lines, double quotes), snake_case, type hints required
- **TypeScript:** Strict mode, camelCase functions, PascalCase types, Zod for validation, biome for linting
- **Go:** Standard gofmt, internal/ for private packages
- **Commits:** Scoped Commits (`<scope>: <description>`); emoji after `:` is fine; no `feat`/`fix`
- Never commit secrets; use env vars for credentials
