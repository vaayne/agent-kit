---
name: openlist
description: Manage files on an OpenList (AList-compatible) cloud storage server. Use when the user wants to list, search, copy, move, rename, delete, upload, or download files on cloud storage managed by OpenList/AList. Triggers on phrases like "openlist", "alist", "manage cloud storage", "network drive", or file operations against a self-hosted file server. Also use when the user mentions Emby, Jellyfin, or media library organization on cloud storage.
---

# OpenList File Manager

Manage files on an OpenList server via its REST API. OpenList is an AList-compatible multi-storage file listing program.

## Setup

`{project}` is the git repo name (if in a git repo) or the basename of the current working directory.

Copy both SDK and CLI to `~/.agents/sessions/{project}/scripts/`, then load env vars:

```bash
cp skills/openlist/scripts/openlist_client.py skills/openlist/scripts/openlist.py ~/.agents/sessions/{project}/scripts/
source ~/.zshenv
```

### Environment variables

| Variable            | Required        | Notes                                 |
| ------------------- | --------------- | ------------------------------------- |
| `OPENLIST_URL`      | Yes             | Base URL e.g. `http://localhost:5244` |
| `OPENLIST_TOKEN`    | One of these    | Pre-issued JWT token (preferred)      |
| `OPENLIST_USERNAME` | One of these    | Username for login                    |
| `OPENLIST_PASSWORD` | If USERNAME set | Password for login                    |

## Workflow

1. Verify env vars are set (`OPENLIST_URL` + auth).
2. Clarify the target path(s), operation, and any dry-run requirement.
3. Pick the right approach:

| Scenario                                                   | Approach                  |
| ---------------------------------------------------------- | ------------------------- |
| Single operation (ls, rename, mv, mkdir, rm, regex-rename) | Bundled CLI directly      |
| Multi-step workflow (mkdir → move → rename → cleanup)      | Task script importing SDK |
| Needs dry-run preview of a complex plan                    | Task script               |
| Needs retry logic (e.g. Quark async moves)                 | Task script               |

4. For task scripts: lint with `uvx ruff check --fix`, run with `uv run --script`.
5. Report results.

## Bundled CLI & SDK

- **`scripts/openlist_client.py`** — `OpenListClient` class + `size_fmt` helper. Import in custom scripts:
  ```python
  import sys
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).parent))
  from openlist_client import OpenListClient
  ```
- **`scripts/openlist.py`** — CLI wrapper covering all endpoints. Run as:
  ```bash
  SCRIPT="uv run --script ~/.agents/sessions/{project}/scripts/openlist.py"
  $SCRIPT ls "/quark/来自：分享/TVs"
  $SCRIPT rename "/path/to/old" "new-name"
  ```

## References

| File                            | When to read                             |
| ------------------------------- | ---------------------------------------- |
| `references/use-cases.md`       | Emby/Jellyfin naming, common CLI recipes |
| `references/client-template.md` | Writing custom task scripts with SDK     |
| `references/api.md`             | Full API endpoint details                |

When the user mentions Emby, Jellyfin, or media library organization, read `references/use-cases.md` first.

## Script conventions

- Save task scripts to `~/.agents/sessions/{project}/scripts/{script_name}.py`
- Always offer `--dry-run` for destructive operations
- Print a summary table (via `rich.table`) before executing
- Quark storage moves are async — add retry/delay between move and rename steps
