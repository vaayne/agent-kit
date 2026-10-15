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


def codex_managed(content: bytes) -> dict:
    settings = tomllib.loads(content.decode())
    for project in list(settings.get("projects", {})):
        entry = settings["projects"][project]
        entry.pop("trust_level", None)
        if not entry:
            del settings["projects"][project]
    if settings.get("projects") == {}:
        del settings["projects"]
    if "tui" in settings:
        settings["tui"].pop("screen_reader_detection_done", None)
        if not settings["tui"]:
            del settings["tui"]
    return settings


def codex_digest(content: bytes | None) -> str | None:
    if content is None:
        return None
    return digest(json.dumps(codex_managed(content), sort_keys=True).encode())


def preserve_codex_state(desired: bytes, current: bytes) -> bytes:
    settings = tomllib.loads(current.decode())
    lines = []
    for project, entry in settings.get("projects", {}).items():
        if "trust_level" in entry:
            lines.append(
                f"projects.{json.dumps(project)}.trust_level = "
                f"{json.dumps(entry['trust_level'])}\n"
            )
    tui = settings.get("tui", {})
    if "screen_reader_detection_done" in tui:
        lines.append(
            "tui.screen_reader_detection_done = "
            f"{json.dumps(tui['screen_reader_detection_done'])}\n"
        )
    merged = "".join(lines).encode() + desired
    # Reject conflicting repository tables before any files are written.
    tomllib.loads(merged.decode())
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
    files: list[tuple[Path, Path, bytes, bytes | None, bytes]] = []
    for provider, destination in [
        ("claude", Path(os.environ.get("CLAUDE_CONFIG_DIR", home / ".claude"))),
        ("codex", Path(os.environ.get("CODEX_HOME", home / ".codex"))),
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
            if source.suffix == ".json":
                json.loads(desired)
            elif source.suffix == ".toml":
                tomllib.loads(desired.decode())
            elif source.suffix != ".md":
                raise ValueError(f"Unsupported configuration file: {source}")
            target = destination / source.relative_to(source_dir)
            regular_path(target)
            current = target.read_bytes() if target.exists() else None
            source_content = desired
            is_codex = provider == "codex" and source.name == "config.toml"
            fingerprint = codex_digest if is_codex else digest
            if is_codex and current is not None:
                if codex_managed(current) == codex_managed(desired):
                    desired = current
                else:
                    desired = preserve_codex_state(desired, current)
            if (
                current != desired
                and not replace
                and (current is not None or str(target) in previous)
                and digest(current) != previous.get(str(target))
                and fingerprint(current) != previous.get(str(target))
            ):
                raise ValueError(
                    f"Local edits: {target}. Review them, then use --replace "
                    "to back up and apply the repository configuration."
                )
            files.append((source, target, desired, current, source_content))

    changed = [row for row in files if row[2] != row[3]]
    for _, target, _, _, _ in changed:
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
        for index, (_, target, desired, current, _) in enumerate(changed):
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
        for source, target, desired, current, source_content in files:
            regular_path(target)
            observed = target.read_bytes() if target.exists() else None
            if source.read_bytes() != source_content or observed != current:
                raise ValueError(f"Configuration changed during sync: {target}")
        for _, target, desired, current, _ in changed:
            regular_path(target)
            observed = target.read_bytes() if target.exists() else None
            if observed != current:
                raise ValueError(f"Target changed before write: {target}")
            mode = target.stat().st_mode & 0o777 if target.exists() else 0o600
            write_file(target, desired, mode)

    for source, target, desired, _, source_content in files:
        regular_path(target)
        if source.read_bytes() != source_content or target.read_bytes() != desired:
            raise ValueError(f"Configuration changed during sync: {target}")
    write_file(
        state_file,
        (
            json.dumps(
                {
                    str(target): (
                        codex_digest(desired)
                        if source == ROOT / "config/codex/config.toml"
                        else digest(desired)
                    )
                    for source, target, desired, _, _ in files
                },
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
