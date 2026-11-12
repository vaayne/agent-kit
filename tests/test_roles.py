"""Check that native Claude roles match the coding skill's role table.

The coding skill is the source of truth for roles and models. Claude Code
needs its own agent files and advisor setting, so this test catches drift.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLAUDE_MODELS = {"fable", "opus", "sonnet", "haiku"}
NATIVE_AGENTS = {"Explorer": "Explore", "Worker": "worker", "Reviewer": "reviewer"}


def role_models() -> dict[str, list[str]]:
    text = (ROOT / "skills/coding/SKILL.md").read_text()
    section = text.split("## Roles", 1)[1].split("\n\n", 2)[1]
    roles: dict[str, list[str]] = {}
    for line in section.splitlines()[2:]:
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        roles[cells[0]] = re.findall(r"`([^`]+)`", cells[2])
    return roles


def frontmatter(path: Path) -> dict[str, str]:
    block = path.read_text().split("---", 2)[1]
    pairs = (line.split(":", 1) for line in block.strip().splitlines())
    return {key.strip(): value.strip() for key, value in pairs}


def first_claude_model(models: list[str]) -> str:
    return next(model for model in models if model in CLAUDE_MODELS)


class RoleConsistencyTests(unittest.TestCase):
    def test_native_agents_match_skill(self) -> None:
        roles = role_models()
        agents = ROOT / "config/claude/agents"
        self.assertEqual(
            {path.stem for path in agents.glob("*.md")}, set(NATIVE_AGENTS.values())
        )
        for role, agent in NATIVE_AGENTS.items():
            with self.subTest(role=role):
                fields = frontmatter(agents / f"{agent}.md")
                self.assertEqual(fields["model"], first_claude_model(roles[role]))
                self.assertEqual(fields["effort"], "medium")

    def test_advisor_matches_skill(self) -> None:
        settings = json.loads((ROOT / "config/claude/settings.json").read_text())
        advisor = first_claude_model(role_models()["Advisor"])
        self.assertEqual(settings["advisorModel"], advisor)


if __name__ == "__main__":
    unittest.main()
