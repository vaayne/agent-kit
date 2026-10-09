"""Run configuration sync against disposable HOME directories."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ConfigSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        scratch = tempfile.TemporaryDirectory(prefix="agent-kit-config-test-")
        self.addCleanup(scratch.cleanup)
        self.base = Path(scratch.name).resolve()
        self.repo = self.base / "repo"
        self.home = self.base / "home"
        self.home.mkdir()
        shutil.copytree(ROOT / "config", self.repo / "config")
        (self.repo / "scripts").mkdir()
        shutil.copy2(
            ROOT / "scripts/sync_config.py", self.repo / "scripts/sync_config.py"
        )
        self.env = {
            "HOME": str(self.home),
            "PATH": os.defpath,
            "XDG_STATE_HOME": str(self.base / "state"),
        }
        self.state = self.base / "state/agent-kit"
        self.claude = self.home / ".claude/settings.json"
        self.codex = self.home / ".codex/config.toml"

    def run_sync(self, *args: str, status: int = 0) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [sys.executable, str(self.repo / "scripts/sync_config.py"), *args],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, status, result.stderr)
        return result

    def change_source(self) -> bytes:
        source = self.repo / "config/claude/settings.json"
        settings = json.loads(source.read_text())
        settings["effortLevel"] = "low"
        content = (json.dumps(settings, indent=2) + "\n").encode()
        source.write_bytes(content)
        return content

    def test_fresh_sync_check_and_repeat(self) -> None:
        self.run_sync("--check", status=1)
        self.assertEqual(list(self.home.iterdir()), [])
        self.assertFalse(self.state.exists())
        self.run_sync()
        self.assertEqual(
            self.claude.read_bytes(),
            (ROOT / "config/claude/settings.json").read_bytes(),
        )
        self.assertEqual(
            self.codex.read_bytes(), (ROOT / "config/codex/config.toml").read_bytes()
        )
        baseline = json.loads((self.state / "config.json").read_text())
        self.assertEqual(len(baseline), 6)
        self.assertEqual(self.codex.stat().st_mode & 0o777, 0o600)
        backups = list((self.state / "backups").iterdir())
        self.run_sync("--check")
        self.run_sync()
        self.assertEqual(backups, list((self.state / "backups").iterdir()))

    def test_source_update_saves_backup(self) -> None:
        self.run_sync()
        before = self.claude.read_bytes()
        self.claude.chmod(0o640)
        desired = self.change_source()
        self.run_sync("--check", status=1)
        self.assertEqual(self.claude.read_bytes(), before)
        self.run_sync()
        self.assertEqual(self.claude.read_bytes(), desired)
        self.assertEqual(self.claude.stat().st_mode & 0o777, 0o640)
        backup = max(
            (self.state / "backups").iterdir(), key=lambda path: path.stat().st_mtime_ns
        )
        self.assertEqual((backup / "0").read_bytes(), before)
        self.assertEqual(
            json.loads((backup / "journal.json").read_text())[0]["target"],
            str(self.claude),
        )

    def test_local_drift_blocks_all_configuration_writes(self) -> None:
        self.run_sync()
        before = self.claude.read_bytes()
        self.codex.write_text('model_reasoning_effort = "low"\n')
        self.change_source()
        result = self.run_sync(status=1)
        self.assertIn("Local edits", result.stderr)
        self.assertEqual(self.claude.read_bytes(), before)
        self.assertEqual(self.codex.read_text(), 'model_reasoning_effort = "low"\n')

    def test_first_sync_conflict_requires_replace_and_backups(self) -> None:
        self.claude.parent.mkdir()
        existing = b'{"model": "sonnet"}\n'
        self.claude.write_bytes(existing)
        self.run_sync(status=1)
        self.assertFalse(self.codex.exists())
        self.run_sync("--replace")
        backup = next((self.state / "backups").iterdir())
        journal = json.loads((backup / "journal.json").read_text())
        index = next(
            index
            for index, row in enumerate(journal)
            if row["target"] == str(self.claude)
        )
        self.assertEqual((backup / str(index)).read_bytes(), existing)

    def test_local_deletion_is_refused(self) -> None:
        self.run_sync()
        self.codex.unlink()
        result = self.run_sync(status=1)
        self.assertIn("Local edits", result.stderr)
        self.assertFalse(self.codex.exists())

    def test_invalid_source_fails_before_copy(self) -> None:
        for filename, content in [
            ("claude/settings.json", b"{"),
            ("codex/config.toml", b"[broken"),
        ]:
            with self.subTest(filename=filename):
                source = self.repo / "config" / filename
                original = source.read_bytes()
                source.write_bytes(content)
                self.run_sync(status=1)
                self.assertFalse(self.claude.exists())
                self.assertFalse(self.codex.exists())
                source.write_bytes(original)

    def test_symlink_destination_is_refused(self) -> None:
        outside = self.base / "outside"
        outside.mkdir()
        (self.home / ".claude").symlink_to(outside, target_is_directory=True)
        result = self.run_sync("--replace", status=1)
        self.assertIn("Refusing symlink", result.stderr)
        self.assertEqual(list(outside.iterdir()), [])

    def test_unmanaged_files_and_destination_overrides(self) -> None:
        destination = self.base / "custom-claude"
        destination.mkdir()
        self.env["CLAUDE_CONFIG_DIR"] = str(destination)
        self.env["CODEX_HOME"] = str(self.base / "custom-codex")
        unrelated = destination / "agents/personal.md"
        unrelated.parent.mkdir()
        unrelated.write_text("Personal agent\n")
        credentials = self.base / "custom-codex/auth.json"
        credentials.parent.mkdir()
        credentials.write_text('{"fixture": true}\n')
        self.run_sync()
        self.assertTrue((destination / "settings.json").is_file())
        self.assertTrue((credentials.parent / "config.toml").is_file())
        self.assertEqual(unrelated.read_text(), "Personal agent\n")
        self.assertEqual(credentials.read_text(), '{"fixture": true}\n')
        self.assertFalse((self.home / ".claude").exists())


if __name__ == "__main__":
    unittest.main()
