"""Run configuration sync against disposable HOME directories."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
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
        self.pi = self.home / ".pi/agent/settings.json"

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
        self.assertEqual(len(baseline), 9)
        self.assertEqual(
            self.pi.read_bytes(), (ROOT / "config/pi/settings.json").read_bytes()
        )
        for name in ("mcp.json", "pi-vcc-config.json"):
            self.assertEqual(
                (self.pi.parent / name).read_bytes(),
                (ROOT / "config/pi" / name).read_bytes(),
            )
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
        self.change_source()
        for target, content in [
            (self.codex, 'model_reasoning_effort = "low"\n'),
            (self.pi.parent / "mcp.json", '{"mcpServers": {"local": {}}}\n'),
            (self.pi.parent / "pi-vcc-config.json", '{"debug": true}\n'),
        ]:
            with self.subTest(target=target.name):
                original = target.read_bytes()
                target.write_text(content)
                result = self.run_sync(status=1)
                self.assertIn("Local edits", result.stderr)
                self.assertEqual(self.claude.read_bytes(), before)
                self.assertEqual(target.read_text(), content)
                target.write_bytes(original)

    def test_codex_runtime_state_survives_source_updates(self) -> None:
        self.run_sync()
        runtime = (
            '\n[projects."/tmp/project.with.dots"]\ntrust_level = "trusted"\n'
            "\n[tui]\nscreen_reader_detection_done = true\n"
        )
        self.codex.write_text(self.codex.read_text() + runtime)
        before = self.codex.read_bytes()
        self.run_sync("--check")
        self.run_sync()
        self.assertEqual(self.codex.read_bytes(), before)
        source = self.repo / "config/codex/config.toml"
        source.write_text(
            source.read_text().replace(
                'model_reasoning_effort = "medium"', 'model_reasoning_effort = "low"'
            )
        )
        # Codex may change runtime state again after the baseline is recorded.
        self.codex.write_text(
            self.codex.read_text().replace('"trusted"', '"untrusted"')
        )
        self.run_sync()
        settings = tomllib.loads(self.codex.read_text())
        self.assertEqual(settings["model_reasoning_effort"], "low")
        self.assertEqual(
            settings["projects"]["/tmp/project.with.dots"]["trust_level"], "untrusted"
        )
        self.assertIs(settings["tui"]["screen_reader_detection_done"], True)
        self.run_sync("--check")

    def test_codex_other_project_and_tui_edits_are_protected(self) -> None:
        self.run_sync()
        before = self.codex.read_text()
        for extra in [
            '\n[projects."/tmp/example"]\nmodel = "local-model"\n',
            '\n[tui]\ntheme = "local-theme"\n',
        ]:
            with self.subTest(extra=extra):
                self.codex.write_text(before + extra)
                result = self.run_sync(status=1)
                self.assertIn("Local edits", result.stderr)
                self.assertEqual(self.codex.read_text(), before + extra)

    def test_codex_replace_preserves_runtime_state(self) -> None:
        self.codex.parent.mkdir()
        self.codex.write_text(
            'model_reasoning_effort = "low"\n'
            '[projects."/tmp/example"]\ntrust_level = "trusted"\n'
            "[tui]\nscreen_reader_detection_done = true\n"
        )
        self.run_sync("--replace")
        settings = tomllib.loads(self.codex.read_text())
        self.assertEqual(settings["model_reasoning_effort"], "medium")
        self.assertEqual(settings["projects"]["/tmp/example"]["trust_level"], "trusted")
        self.assertIs(settings["tui"]["screen_reader_detection_done"], True)
        self.run_sync("--check")

    def test_pi_local_settings_survive_first_sync_and_source_updates(self) -> None:
        public = json.loads((self.repo / "config/pi/settings.json").read_text())
        local = {
            "defaultProvider": "local-provider",
            "defaultModel": "local-model",
            "enabledModels": ["local-provider/*"],
            "lastChangelogVersion": "1.0.0",
            "otel": {"endpoint": "http://localhost:4317"},
            "theme": "local-theme",
            "extension-specific-setting": {"enabled": True},
        }
        self.pi.parent.mkdir(parents=True)
        self.pi.write_text(json.dumps(public | local))
        before = self.pi.read_bytes()
        self.run_sync()
        self.assertEqual(self.pi.read_bytes(), before)
        local["lastChangelogVersion"] = "1.1.0"
        local["defaultModel"] = "another-local-model"
        self.pi.write_text(json.dumps(public | local))
        self.run_sync("--check")
        source = self.repo / "config/pi/settings.json"
        public["packages"] = ["npm:pi-web-access"]
        source.write_text(json.dumps(public))
        self.run_sync("--check", status=1)
        self.run_sync()
        self.assertEqual(json.loads(self.pi.read_text()), public | local)
        self.run_sync("--check")

    def test_pi_public_drift_requires_replace_and_keeps_local_settings(self) -> None:
        self.run_sync()
        settings = json.loads(self.pi.read_text())
        settings["defaultProjectTrust"] = "ask"
        settings["theme"] = "local-theme"
        settings["defaultProvider"] = "local-provider"
        self.pi.write_text(json.dumps(settings))
        before = self.pi.read_bytes()
        self.change_source()
        result = self.run_sync(status=1)
        self.assertIn("Local edits", result.stderr)
        self.assertEqual(self.pi.read_bytes(), before)
        self.run_sync("--replace")
        actual = json.loads(self.pi.read_text())
        self.assertEqual(actual["defaultProjectTrust"], "always")
        self.assertEqual(actual["theme"], "local-theme")
        self.assertEqual(actual["defaultProvider"], "local-provider")
        self.run_sync("--check")

    def test_pi_unmanaged_settings_are_rejected_in_source(self) -> None:
        source = self.repo / "config/pi/settings.json"
        settings = json.loads(source.read_text())
        settings["otel"] = {"endpoint": "http://localhost:4317"}
        source.write_text(json.dumps(settings))
        result = self.run_sync(status=1)
        self.assertIn("Unsupported Pi sync settings", result.stderr)
        self.assertFalse(self.claude.exists())

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
            ("pi/settings.json", b"[1]"),
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
        self.env["PI_CODING_AGENT_DIR"] = str(self.base / "custom-pi")
        unrelated = destination / "agents/personal.md"
        unrelated.parent.mkdir()
        unrelated.write_text("Personal agent\n")
        credentials = self.base / "custom-codex/auth.json"
        credentials.parent.mkdir()
        credentials.write_text('{"fixture": true}\n')
        pi_auth = self.base / "custom-pi/auth.json"
        pi_auth.parent.mkdir()
        pi_auth.write_text('{"fixture": true}\n')
        self.run_sync()
        self.assertTrue((destination / "settings.json").is_file())
        self.assertTrue((credentials.parent / "config.toml").is_file())
        self.assertEqual(unrelated.read_text(), "Personal agent\n")
        self.assertEqual(credentials.read_text(), '{"fixture": true}\n')
        self.assertFalse((self.home / ".claude").exists())
        self.assertTrue((pi_auth.parent / "settings.json").is_file())
        self.assertTrue((pi_auth.parent / "mcp.json").is_file())
        self.assertTrue((pi_auth.parent / "pi-vcc-config.json").is_file())
        self.assertEqual(pi_auth.read_text(), '{"fixture": true}\n')
        self.assertFalse((self.home / ".pi").exists())


if __name__ == "__main__":
    unittest.main()
