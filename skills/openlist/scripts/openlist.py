#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "click",
#     "httpx",
#     "rich",
# ]
# ///
"""
OpenList CLI — manage files on an OpenList/AList server.

Thin CLI wrapper around openlist_client.OpenListClient.
"""

import logging
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.logging import RichHandler
from rich.table import Table

sys.path.insert(0, str(Path(__file__).parent))
from openlist_client import OpenListClient, size_fmt

LOG_DIR = Path(".agents/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.WARNING,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[
        RichHandler(console=Console(stderr=True)),
        logging.FileHandler(LOG_DIR / "openlist.log"),
    ],
)
logger = logging.getLogger(__name__)
console = Console()


@click.group()
@click.option("-v", "--verbose", is_flag=True, help="Enable debug logging")
@click.pass_context
def cli(ctx, verbose: bool):
    """OpenList file manager CLI."""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    ctx.ensure_object(dict)
    ctx.obj["client"] = OpenListClient.from_env()


@cli.command("ls")
@click.argument("path", default="/")
@click.option("--refresh", is_flag=True)
@click.pass_context
def cmd_ls(ctx, path: str, refresh: bool):
    """List directory contents."""
    client: OpenListClient = ctx.obj["client"]
    items = client.list_all(path)
    table = Table(title=path)
    table.add_column("Name")
    table.add_column("Type", width=5)
    table.add_column("Size", justify="right")
    table.add_column("Modified")
    for item in items:
        ftype = "[blue]DIR[/blue]" if item["is_dir"] else "FILE"
        size = "-" if item["is_dir"] else size_fmt(item.get("size", 0))
        table.add_row(item["name"], ftype, size, item.get("modified", "")[:19])
    console.print(table)


@cli.command("get")
@click.argument("path")
@click.pass_context
def cmd_get(ctx, path: str):
    """Get metadata for a file or directory."""
    client: OpenListClient = ctx.obj["client"]
    info = client.get(path)
    for k, v in info.items():
        console.print(f"[bold]{k}[/bold]: {v}")


@cli.command("search")
@click.argument("keywords")
@click.option("--parent", default="/", show_default=True)
@click.option("--scope", type=click.Choice(["all", "dirs", "files"]), default="all")
@click.pass_context
def cmd_search(ctx, keywords: str, parent: str, scope: str):
    """Search files and directories by keyword."""
    client: OpenListClient = ctx.obj["client"]
    scope_map = {"all": 0, "dirs": 1, "files": 2}
    data = client.search(parent, keywords, scope=scope_map[scope])
    items = data.get("content") or []
    table = Table(title=f'Search "{keywords}" in {parent}')
    table.add_column("Parent")
    table.add_column("Name")
    table.add_column("Type", width=5)
    table.add_column("Size", justify="right")
    for item in items:
        ftype = "[blue]DIR[/blue]" if item["is_dir"] else "FILE"
        size = "-" if item["is_dir"] else size_fmt(item.get("size", 0))
        table.add_row(item["parent"], item["name"], ftype, size)
    console.print(table)
    console.print(f"[dim]{data.get('total', 0)} result(s)[/dim]")


@cli.command("tree")
@click.argument("path", default="/")
@click.pass_context
def cmd_tree(ctx, path: str):
    """Show directory tree (folders only)."""
    client: OpenListClient = ctx.obj["client"]
    dirs = client.dirs(path)
    console.print(f"[bold]{path}[/bold]")
    for d in dirs:
        console.print(f"  └── [blue]{d['name']}[/blue]")


@cli.command("mkdir")
@click.argument("path")
@click.pass_context
def cmd_mkdir(ctx, path: str):
    """Create a directory."""
    client: OpenListClient = ctx.obj["client"]
    client.mkdir(path)
    console.print(f"[green]Created:[/green] {path}")


@cli.command("rename")
@click.argument("path")
@click.argument("new_name")
@click.pass_context
def cmd_rename(ctx, path: str, new_name: str):
    """Rename a file or directory."""
    client: OpenListClient = ctx.obj["client"]
    client.rename(path, new_name)
    console.print(f"[green]Renamed:[/green] {path} → {new_name}")


@cli.command("regex-rename")
@click.argument("src_dir")
@click.argument("src_regex")
@click.argument("new_regex")
@click.pass_context
def cmd_regex_rename(ctx, src_dir: str, src_regex: str, new_regex: str):
    """Rename files using regex. Example: '(.*)\\.txt$' '$1.md'"""
    client: OpenListClient = ctx.obj["client"]
    client.regex_rename(src_dir, src_regex, new_regex)
    console.print(f"[green]Regex rename done in:[/green] {src_dir}")


@cli.command("mv")
@click.argument("src_dir")
@click.argument("dst_dir")
@click.argument("names", nargs=-1, required=True)
@click.pass_context
def cmd_mv(ctx, src_dir: str, dst_dir: str, names: tuple):
    """Move files from src_dir to dst_dir."""
    client: OpenListClient = ctx.obj["client"]
    client.move(src_dir, dst_dir, list(names))
    console.print(f"[green]Moved {len(names)} item(s):[/green] {src_dir} → {dst_dir}")


@cli.command("mvr")
@click.argument("src_dir")
@click.argument("dst_dir")
@click.pass_context
def cmd_mvr(ctx, src_dir: str, dst_dir: str):
    """Recursively move entire directory tree."""
    client: OpenListClient = ctx.obj["client"]
    client.recursive_move(src_dir, dst_dir)
    console.print(f"[green]Recursive move done:[/green] {src_dir} → {dst_dir}")


@cli.command("cp")
@click.argument("src_dir")
@click.argument("dst_dir")
@click.argument("names", nargs=-1, required=True)
@click.pass_context
def cmd_cp(ctx, src_dir: str, dst_dir: str, names: tuple):
    """Copy files from src_dir to dst_dir."""
    client: OpenListClient = ctx.obj["client"]
    client.copy(src_dir, dst_dir, list(names))
    console.print(f"[green]Copied {len(names)} item(s):[/green] {src_dir} → {dst_dir}")


@cli.command("rm")
@click.argument("directory")
@click.argument("names", nargs=-1, required=True)
@click.option("--yes", is_flag=True, help="Skip confirmation")
@click.pass_context
def cmd_rm(ctx, directory: str, names: tuple, yes: bool):
    """Delete files or directories."""
    if not yes:
        click.confirm(f"Delete {len(names)} item(s) from {directory}?", abort=True)
    client: OpenListClient = ctx.obj["client"]
    client.remove(directory, list(names))
    console.print(f"[green]Deleted {len(names)} item(s) from[/green] {directory}")


@cli.command("rmempty")
@click.argument("src_dir")
@click.pass_context
def cmd_rmempty(ctx, src_dir: str):
    """Recursively remove empty directories."""
    client: OpenListClient = ctx.obj["client"]
    client.remove_empty_dirs(src_dir)
    console.print(f"[green]Empty dirs removed under:[/green] {src_dir}")


@cli.command("upload")
@click.argument("local_path", type=click.Path(exists=True, path_type=Path))
@click.argument("remote_path")
@click.option("--as-task", is_flag=True, help="Run as background task")
@click.pass_context
def cmd_upload(ctx, local_path: Path, remote_path: str, as_task: bool):
    """Upload a local file to remote_path."""
    client: OpenListClient = ctx.obj["client"]
    result = client.upload(local_path, remote_path, as_task=as_task)
    if as_task and result.get("task"):
        t = result["task"]
        console.print(f"[green]Task queued:[/green] {t['name']} (id={t['id']})")
    else:
        console.print(f"[green]Uploaded:[/green] {local_path} → {remote_path}")


@cli.command("dl")
@click.argument("remote_dir")
@click.argument("urls", nargs=-1, required=True)
@click.option(
    "--tool",
    type=click.Choice(["SimpleHttp", "aria2", "qBittorrent"]),
    default="SimpleHttp",
    show_default=True,
)
@click.option(
    "--delete-policy",
    type=click.Choice(
        [
            "delete_on_upload_succeed",
            "delete_on_upload_failed",
            "delete_never",
            "delete_always",
        ]
    ),
    default="delete_on_upload_succeed",
    show_default=True,
)
@click.pass_context
def cmd_dl(ctx, remote_dir: str, urls: tuple, tool: str, delete_policy: str):
    """Add offline download task(s) (HTTP/magnet/torrent)."""
    client: OpenListClient = ctx.obj["client"]
    result = client.offline_download(
        remote_dir, list(urls), tool=tool, delete_policy=delete_policy
    )
    for task in result.get("tasks") or []:
        console.print(f"[green]Task:[/green] {task['name']} (id={task['id']})")


@cli.command("me")
@click.pass_context
def cmd_me(ctx):
    """Show current user info."""
    client: OpenListClient = ctx.obj["client"]
    info = client.me()
    for k, v in info.items():
        console.print(f"[bold]{k}[/bold]: {v}")


if __name__ == "__main__":
    cli()
