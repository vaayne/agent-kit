---
name: spec-dev
description: Plan and build a feature end to end when the user requests the full workflow. For a single planning or implementation step, use blueprint or mason; ordinary small fixes do not need this workflow.
---

# Spec-dev

An orchestrator, not an implementation: each step is its own independently invocable skill; this skill owns only the sequence, the gates, and the skip rules. The one artifact threading through is `plan.md` (location and format owned by `blueprint`).

Ordinary small changes do not need this loop unless the user explicitly requests it.

## The line

| Step     | Skill       | Skip when                                         |
| -------- | ----------- | ------------------------------------------------- |
| 1. Grill | `grill`     | Approach already clear: small fixes, obvious work |
| 2. Plan  | `blueprint` | Never — the plan is the contract                  |
| 3. Build | `mason`     | Plan-only request; otherwise one commit per phase |

Read each step's `SKILL.md` when entering it; the details live there, not here.

Optional bookends, one command away: unfamiliar territory → run `scout` before grilling; after landing → `code-review` for a real audit, `teach` to internalize what changed.

## Gates

Don't pause by default. If the user authorized the loop end to end, run grill → plan → build without re-asking — existing authorization stays valid.

Ask only when a decision is still open and material: major scope choices, safety impact, or hard-to-reverse steps. Finish authorized preparation first so the user reviews a concrete result.

A plan-only request ("write a plan", "plan this out") stops after `plan.md` — deliver it and wait; it does not authorize building. Within implementation, don't gate every phase; mason escalates on surprises and major rework on its own.

## Threading rules

- Grilling's resolved decisions land in `plan.md` — grill produces no artifact of its own.
- Mason's handoff notes and deviations stay in `plan.md`; when an answer changes the design, the affected plan section is updated. One file, whole story.
- Review findings that require rework loop back to mason as a new phase, not ad-hoc patches.
