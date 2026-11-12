"""Run the Bash skill sync against a disposable HOME."""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SkillSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        scratch = tempfile.TemporaryDirectory(prefix="agent-kit-skills-test-")
        self.addCleanup(scratch.cleanup)
        self.base = Path(scratch.name).resolve()
        self.repo = self.base / "repo"
        self.home = self.base / "home"
        self.home.mkdir()
        self.script = self.repo / ".mise/tasks/sync/skills"
        self.script.parent.mkdir(parents=True)
        shutil.copy2(ROOT / ".mise/tasks/sync/skills", self.script)
        self.source = self.repo / "skills/example/SKILL.md"
        self.source.parent.mkdir(parents=True)
        self.source.write_text(
            "---\nname: example\ndescription: Fixture skill\n---\nOriginal\n"
        )
        self.registry = self.repo / "skills/remote-skills.txt"
        self.registry.write_text("# No remote skills in this filesystem fixture\n")
        self.target = self.home / ".agents/skills"
        self.target.mkdir(parents=True)
        self.env = {"HOME": str(self.home), "PATH": os.defpath}

    def run_sync(self, *args: str, status: int = 0) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            ["/bin/bash", str(self.script), *args],
            env=self.env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, status, result.stderr)
        return result

    def test_copy_and_repeat(self) -> None:
        resource = self.source.parent / "scripts/example.sh"
        resource.parent.mkdir()
        resource.write_text("#!/bin/sh\nprintf 'fixture\\n'\n")
        resource.chmod(0o755)
        self.run_sync()
        self.run_sync()
        self.assertEqual(
            (self.target / "example/SKILL.md").read_bytes(), self.source.read_bytes()
        )
        self.assertEqual(
            (self.target / "example/scripts/example.sh").stat().st_mode & 0o777, 0o755
        )
        self.assertFalse((self.target / "remote-skills.txt").exists())

    def test_same_timestamp_update_is_copied(self) -> None:
        self.run_sync()
        original = self.source.read_bytes()
        timestamp = self.source.stat().st_mtime_ns
        self.source.write_bytes(original.replace(b"Original", b"Modified"))
        os.utime(self.source, ns=(timestamp, timestamp))
        self.run_sync()
        self.assertEqual(
            (self.target / "example/SKILL.md").read_bytes(), self.source.read_bytes()
        )

    def test_retired_skill_and_caches_are_removed(self) -> None:
        stale = self.target / "retired/SKILL.md"
        stale.parent.mkdir()
        stale.write_text("Retired skill\n")
        cache = self.source.parent / "__pycache__/x.pyc"
        cache.parent.mkdir()
        cache.write_bytes(b"")
        self.run_sync()
        self.assertFalse(stale.parent.exists())
        self.assertFalse((self.target / "example/__pycache__").exists())

    def test_invalid_registry_or_collision_does_not_publish(self) -> None:
        for content in [
            "owner/repo\n",
            "owner/repo skill extra\n",
            "owner/repo example\n",
            "owner/repo remote\nother/repo remote\n",
            "owner/repo bad@\n",
        ]:
            with self.subTest(content=content):
                self.registry.write_text(content)
                self.run_sync(status=1)
                self.assertFalse((self.target / "example").exists())


if __name__ == "__main__":
    unittest.main()
