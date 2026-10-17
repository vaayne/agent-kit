#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = logging.getLogger("agent-kit.sync.config")


def regular_path(path: Path) -> None:
    for candidate in (path, *path.parents):
        if candidate.is_symlink():
            raise ValueError(f"Refusing symlink: {candidate}")
    if path.exists() and not path.is_file():
        raise ValueError(f"Expected a regular file: {path}")


def digest(content: bytes | None) -> str | None:
    return hashlib.sha256(content).hexdigest() if content is not None else None


def parse(path: Path, content: bytes) -> dict:
    try:
        if path.suffix == ".json":
            data = json.loads(content)
        else:
            data = tomllib.loads(content.decode())
    except ValueError as error:
        raise ValueError(f"Invalid configuration {path}: {error}") from error
    if not isinstance(data, dict):
        raise TypeError(f"Configuration must be an object: {path}")
    return data


def leaves(data: dict, prefix: tuple[str, ...] = ()) -> dict[tuple[str, ...], object]:
    flat = {}
    for key, value in data.items():
        path = (*prefix, key)
        if isinstance(value, dict) and value:
            flat.update(leaves(value, path))
        else:
            flat[path] = value
    return flat


def nest(flat: dict[tuple[str, ...], object]) -> dict:
    data: dict = {}
    for path, value in flat.items():
        node = data
        for key in path[:-1]:
            node = node.setdefault(key, {})
        node[path[-1]] = value
    return data


def projection_digest(data: dict, keys: set[tuple[str, ...]]) -> str | None:
    flat = leaves(data)
    rows = [[list(key), flat[key]] for key in sorted(keys) if key in flat]
    return digest(json.dumps(rows, default=str).encode())


def toml_key(key: str) -> str:
    return key if re.fullmatch(r"[A-Za-z0-9_-]+", key) else json.dumps(key)


def toml_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        return "[" + ", ".join(map(toml_value, value)) + "]"
    if isinstance(value, dict):
        pairs = (f"{toml_key(k)} = {toml_value(v)}" for k, v in value.items())
        return "{" + ", ".join(pairs) + "}"
    if isinstance(value, (int, float)):
        return repr(value)
    return value.isoformat()  # TOML dates and times


def toml_with(desired: bytes, extras: dict[tuple[str, ...], object]) -> bytes:
    """Add each extra under the deepest table header of the repository file."""
    text = desired.decode()
    lines = (text if text.endswith("\n") else text + "\n").splitlines(keepends=True)
    headers = {}
    for index, line in enumerate(lines):
        match = re.fullmatch(r"\[([^\[\]]+)\]\s*(#.*)?", line.strip())
        if match:
            headers[next(iter(leaves(tomllib.loads(f"{match[1]} = 0"))))] = index
    inserts: dict[int, list[str]] = {}
    for path, value in extras.items():
        tables = [t for t in headers if len(t) < len(path) and path[: len(t)] == t]
        table = max(tables, key=len, default=())
        key = ".".join(map(toml_key, path[len(table) :]))
        at = headers[table] if table else -1
        inserts.setdefault(at, []).append(f"{key} = {toml_value(value)}\n")
    out = inserts.get(-1, [])
    for index, line in enumerate(lines):
        out += [line, *inserts.get(index, [])]
    return "".join(out).encode()


def merge(
    target: Path,
    desired: bytes,
    current: bytes,
    retired: set[tuple[str, ...]],
) -> bytes:
    """Apply the repository keys and keep the keys that only the target sets."""
    repo = leaves(parse(target, desired))
    owned = set(repo) | retired
    prefixes = {key[:i] for key in owned for i in range(1, len(key) + 1)}
    existing = parse(target, current)
    extras = {
        path: value
        for path, value in leaves(existing).items()
        if path not in prefixes
        and not any(path[:i] in owned for i in range(1, len(path)))
    }
    expected = nest(repo | extras)
    if expected == existing:
        return current
    if not extras:
        return desired
    if target.suffix == ".json":
        merged = (json.dumps(expected, indent=2) + "\n").encode()
    else:
        merged = toml_with(desired, extras)
    if parse(target, merged) != expected:
        raise ValueError(f"Cannot keep local settings in {target}")
    return merged


def write_file(path: Path, content: bytes, mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".agent-kit-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            os.fchmod(stream.fileno(), mode)
        regular_path(path)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def sync(check: bool, replace: bool) -> int:
    home = Path.home()
    state_dir = Path(os.environ.get("XDG_STATE_HOME", home / ".local/state"))
    state_file = state_dir / "agent-kit/config.json"
    regular_path(state_file)
    previous = json.loads(state_file.read_text()) if state_file.exists() else {}
    if not isinstance(previous, dict):
        raise TypeError(f"Invalid deployment baseline: {state_file}")
    files: list[tuple[Path, Path, bytes, bytes | None, bytes, object]] = []
    for provider, destination in [
        ("claude", Path(os.environ.get("CLAUDE_CONFIG_DIR", home / ".claude"))),
        ("codex", Path(os.environ.get("CODEX_HOME", home / ".codex"))),
        ("pi", Path(os.environ.get("PI_CODING_AGENT_DIR", home / ".pi/agent"))),
    ]:
        source_dir = ROOT / "config" / provider
        if not source_dir.is_dir() or source_dir.is_symlink():
            raise ValueError(f"Missing regular configuration directory: {source_dir}")
        for source in sorted(source_dir.rglob("*")):
            if source.is_symlink():
                raise ValueError(f"Refusing symlink: {source}")
            if source.is_dir():
                continue
            regular_path(source)
            desired = source.read_bytes()
            structured = source.suffix in {".json", ".toml"}
            if structured:
                keys = set(leaves(parse(source, desired)))
            elif source.suffix != ".md":
                raise ValueError(f"Unsupported configuration file: {source}")
            target = destination / source.relative_to(source_dir)
            regular_path(target)
            current = target.read_bytes() if target.exists() else None
            source_content = desired
            # A structured baseline records the digest and keys that the
            # repository owned; target-only keys belong to the machine.
            entry = previous.get(str(target))
            known = digest(current) == entry
            if structured:
                if isinstance(entry, dict):
                    owned = {tuple(key) for key in entry["keys"]}
                    entry = entry["digest"]
                else:
                    owned = keys
                if current is not None:
                    known = (
                        known
                        or projection_digest(parse(target, current), owned) == entry
                    )
                    desired = merge(target, desired, current, owned - keys)
                baseline = {
                    "digest": projection_digest(parse(target, desired), keys),
                    "keys": sorted(map(list, keys)),
                }
            else:
                baseline = digest(desired)
            if (
                current != desired
                and not replace
                and (current is not None or entry is not None)
                and not known
            ):
                raise ValueError(
                    f"Local edits: {target}. Review them, then use --replace "
                    "to back up and apply the repository configuration."
                )
            files.append((source, target, desired, current, source_content, baseline))

    changed = [row for row in files if row[2] != row[3]]
    for _, target, *_ in changed:
        LOG.info("%s: %s", "Would copy" if check else "Copy planned", target)
    if check:
        LOG.info("Check complete: %d files differ", len(changed))
        return int(bool(changed))

    if changed:
        backups = state_file.parent / "backups"
        regular_path(backups / "placeholder")
        backups.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = Path(tempfile.mkdtemp(prefix="config-", dir=backups))
        journal = []
        for index, (_, target, _, current, *_) in enumerate(changed):
            if current is not None:
                write_file(backup / str(index), current, 0o600)
            journal.append({"target": str(target), "before": digest(current)})
        write_file(
            backup / "journal.json",
            (json.dumps(journal, indent=2) + "\n").encode(),
            0o600,
        )
        LOG.info("Backup: %s", backup)
        # Check every target before the first write; editors do not share this check.
        for source, target, _, current, source_content, _ in files:
            regular_path(target)
            observed = target.read_bytes() if target.exists() else None
            if source.read_bytes() != source_content or observed != current:
                raise ValueError(f"Configuration changed during sync: {target}")
        for _, target, desired, current, *_ in changed:
            regular_path(target)
            observed = target.read_bytes() if target.exists() else None
            if observed != current:
                raise ValueError(f"Target changed before write: {target}")
            mode = target.stat().st_mode & 0o777 if target.exists() else 0o600
            write_file(target, desired, mode)

    for source, target, desired, _, source_content, _ in files:
        regular_path(target)
        if source.read_bytes() != source_content or target.read_bytes() != desired:
            raise ValueError(f"Configuration changed during sync: {target}")
    write_file(
        state_file,
        (
            json.dumps(
                {str(target): baseline for _, target, *_, baseline in files},
                indent=2,
            )
            + "\n"
        ).encode(),
        0o600,
    )
    LOG.info("Sync complete: %d copied, %d verified", len(changed), len(files))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync public agent configuration")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check", action="store_true", help="Check without writing files"
    )
    mode.add_argument(
        "--replace", action="store_true", help="Back up and replace local edits"
    )
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    try:
        if not args.check:
            logs = Path.home() / ".agents/sessions/agent-kit/logs"
            regular_path(logs / "sync-config.log")
            logs.mkdir(parents=True, exist_ok=True, mode=0o700)
            handler = logging.FileHandler(logs / "sync-config.log")
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s %(message)s")
            )
            LOG.addHandler(handler)
        LOG.info("Sync started: check=%s replace=%s", args.check, args.replace)
        return sync(args.check, args.replace)
    except (OSError, ValueError, TypeError) as error:
        LOG.error("Sync failed: %s", error)
        return 1


if __name__ == "__main__":
    sys.exit(main())
