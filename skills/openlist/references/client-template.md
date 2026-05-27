# OpenList Client SDK

## Quick start

Copy both `scripts/openlist.py` and `scripts/openlist_client.py` to `~/.agents/sessions/{project}/scripts/`, then `source ~/.zshenv`.

**For simple operations**, use the CLI directly — see `use-cases.md`.

**For multi-step workflows** (move + rename + cleanup), write a task-specific script that imports the SDK:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["click", "httpx", "rich"]
# ///
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

sys.path.insert(0, str(Path(__file__).parent))
from openlist_client import OpenListClient, size_fmt

console = Console()


@click.command()
@click.option("--dry-run", is_flag=True, default=False)
def main(dry_run):
    client = OpenListClient.from_env()

    # --- your workflow here ---
    items = client.list_all("/some/path")
    # ...

    if dry_run:
        console.print("[yellow]DRY RUN — no changes made.[/yellow]")
        return

    # execute changes...
    console.print("[green]Done.[/green]")


if __name__ == "__main__":
    main()
```

## When to write a script vs use the CLI

| Scenario                                              | Use                         |
| ----------------------------------------------------- | --------------------------- |
| Single operation (ls, rename, mv, rm)                 | CLI: `$SCRIPT ls /path`     |
| Multi-step workflow (mkdir → move → rename → cleanup) | Custom script importing SDK |
| Needs dry-run preview of a complex plan               | Custom script               |
| Needs retry logic (e.g. Quark async moves)            | Custom script               |

## Common patterns

### Batch delete files matching a pattern

```python
items = client.list_all("/some/dir")
to_delete = [i["name"] for i in items if i["name"].endswith(".tmp")]
if not dry_run:
    client.remove("/some/dir", to_delete)
```

### Recursive listing

```python
def walk(client, path):
    for item in client.list_all(path):
        full = f"{path}/{item['name']}"
        yield full, item
        if item["is_dir"]:
            yield from walk(client, full)
```

### Move all files of a type

```python
items = client.list_all("/downloads")
videos = [
    i["name"] for i in items if not i["is_dir"] and i["name"].endswith((".mp4", ".mkv"))
]
client.move("/downloads", "/media/videos", videos)
```

### Retry after async move (Quark storage)

```python
import time

client.move(src, dst, names)
for name in names:
    for attempt in range(5):
        try:
            client.rename(f"{dst}/{name}", new_name)
            break
        except RuntimeError:
            time.sleep(2 * (attempt + 1))
```
