---
name: spec-dev
description: >
  Plan-first development workflow — the orchestrator over the lifecycle skills:
  grill the idea, write one plan.md, implement it phase by phase. Use when the
  user wants the full disciplined loop for a feature or change: "spec-dev",
  "plan this out and build it", "let's think this through then implement", or
  disciplined, reviewed code changes end to end. For a single step alone, use
  that step's skill directly (grill, blueprint, mason).
---

# Spec-dev

An orchestrator, not an implementation: each step is its own independently invocable skill; this skill owns only the sequence, the gates, and the skip rules. The one artifact threading through is `plan.md` (location and format owned by `blueprint`).

## The line

| Step     | Skill       | Skip when                                         |
| -------- | ----------- | ------------------------------------------------- |
| 1. Grill | `grill`     | Approach already clear: small fixes, obvious work |
| 2. Plan  | `blueprint` | Never — the plan is the contract                  |
| 3. Build | `mason`     | Never — phase-by-phase, one commit per phase      |

Read each step's `SKILL.md` when entering it; the details live there, not here.

Optional bookends, one command away: unfamiliar territory → run `scout` before grilling; after landing → `code-review` for a real audit, `teach` to internalize what changed.

## Gates

Pause for user approval at exactly two points:

1. **After grilling, before the plan.** "Here's what I understand — should I write the plan?"
2. **After the plan, before building.** "Here's the plan — should I start?"

Within implementation, don't gate every phase; mason escalates on surprises and major rework on its own.

## Threading rules

- Grilling's resolved decisions land in `plan.md` — grill produces no artifact of its own.
- Mason's handoff notes and deviations stay in `plan.md`; when an answer changes the design, the affected plan section is updated. One file, whole story.
- Review findings that require rework loop back to mason as a new phase, not ad-hoc patches.
