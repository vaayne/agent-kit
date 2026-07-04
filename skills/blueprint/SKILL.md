---
name: blueprint
description: >
  Write a decision-first implementation plan as plan.md — design decisions with
  alternatives and tradeoffs, phased tasks with acceptance blocks, inline review
  threads, and per-phase handoff notes. Use when the user wants an implementation
  plan, says "write a plan", "plan this out", "写个计划", wants a plan reviewed or
  review threads resolved, or as the Plan step of the spec-dev workflow.
---

# Blueprint

Produce one artifact: `plan.md` at `~/.agents/sessions/{project}/{date}-{feature}/plan.md`, where `{project}` is the git repo name (or the cwd basename outside a repo), `{date}` is `YYYY-MM-DD`, and `{feature}` is a short kebab-case label. That one file holds the plan, inline reviews, impl questions, and per-phase handoff notes.

Follow [references/plan-template.md](references/plan-template.md) for the structure. Two principles govern the writing:

- **Explain why, not just what.** For each significant decision: what was decided, what alternatives were ruled out, what tradeoffs were accepted. A reader who missed the original conversation should be able to critique it.
- **Decision-first ordering.** Lead with what the user is most likely to tweak — data models, type interfaces, user-facing flows. Bury mechanical refactoring at the bottom. The plan is a review surface; put the reviewable decisions where the reviewer starts reading.

Break the work into phases; give every phase an **Acceptance** block defining "done" as observable, runnable checks.

Inline reviews use the `> quote` + `**Review (name):**` pattern; resolve with `**Resolved:**` and update the plan text above. Mid-impl questions use `**Question (name):**` / `**Answer:**`. Both in [references/review-patterns.md](references/review-patterns.md).

To execute a finished plan phase by phase, use the `mason` skill; for the full gated workflow around both, `spec-dev`.
