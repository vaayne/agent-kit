# Rules Extension

A Pi extension that scans project rule files from `.claude/rules/` and `.agents/rules/` folders, then surfaces them in the system prompt.

## How It Works

On session start, the extension scans the project directory for rule files. Found rules are listed in the system prompt so the agent knows they exist and can load them with the `read` tool when relevant.

## Scanned Locations

| Location | Description |
| --- | --- |
| `.claude/rules/` | Claude Code rule files (recursive) |
| `.agents/rules/` | Agent rule files (recursive) |

All `.md` files in the rule directories are discovered recursively, supporting subdirectory organization.

## Best Practices

- **Keep rules focused** — each file should cover one topic (e.g., `testing.md`, `api-design.md`)
- **Use descriptive filenames** — the filename should indicate what the rules cover
- **Organize with subdirectories** — group related rules (e.g., `frontend/`, `backend/`)

## Example Structure

```
my-project/
├── .claude/
│   └── rules/
│       ├── code-style.md
│       └── testing.md
├── .agents/
│   └── rules/
│       ├── release.md
│       └── frontend/
│           └── components.md
└── ...
```

## Installation

```bash
# Install as a pi package
pi install @vaayne/pi-rules

# Or copy to your extensions directory
cp -r extensions/rules ~/.pi/agent/extensions/rules
```
