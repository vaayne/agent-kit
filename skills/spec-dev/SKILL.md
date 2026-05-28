---
name: spec-dev
description: >
  Plan-first development workflow. Grill the idea, write one plan.md, then
  implement it phase by phase. Use this skill whenever the user wants to:
  stress-test a design, write or review an implementation plan, add or resolve
  review comments, track phased implementation progress, or audit open review
  threads. Also use when the user says things like "let's think this through",
  "poke holes in this", "what am I missing", "plan this out", or wants
  disciplined, reviewed code changes. Flow: Grill → Plan → Impl (phase by phase).
---

The flow is **Grill → Plan → Impl (phase by phase)**. The only artifact is `plan.md`, which lives at `~/.agents/sessions/{project}/{date}-{feature}/plan.md` where `{project}` is the git repo name (if in a git repo) or the basename of the current working directory, `{date}` is `YYYY-MM-DD`, and `{feature}` is a short kebab-case label. That one file holds the plan, inline reviews, impl questions, and per-phase handoff notes.

## Grill

Stress-test the design before writing anything down. Read [grilling-guide.md](./references/grilling-guide.md) — interrogate one question at a time, sharpen fuzzy terms, cross-reference with code, probe reversibility.

Skip grilling when the approach is already clear — small bug fixes, straightforward changes, or work where the plan is obvious don't need interrogation.

## Plan

Write `plan.md` following [plan-template.md](./references/plan-template.md). The key principle: explain **why**, not just what. For each significant decision, cover what you decided, what alternatives you ruled out, and what tradeoffs you accepted. Break the work into phases, and give every phase an **Acceptance** block defining "done".

Inline reviews use the `> quote` + `**Review (name):**` pattern; resolve with `**Resolved:**` and update the plan text above. See [review-patterns.md](./references/review-patterns.md).

## Impl (phase by phase)

Each phase is its own catch-up → execute → verify → review-if-needed → commit → handoff cycle. Full workflow in [implementation-guide.md](./references/implementation-guide.md).

Two things to know up front:

- **Review gates** — pause for user approval after grilling (before writing the plan) and after the plan (before implementation). Within impl, don't gate every phase, but escalate on surprises or major rework.
- **Per-phase review is a judgment call** — for each phase, decide whether the work needs another pass before moving on. Trivial phases self-review; phases touching critical paths, security, data, or non-obvious logic warrant a closer look. When in doubt, review.

Impl questions raised mid-phase use the `**Question (name):**` / `**Answer:**` pattern from [review-patterns.md](./references/review-patterns.md). When an answer changes the plan, update the affected section.

## Quick reference

| Action             | What to do                                                                       | Reference                                                       |
| ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Grill a design     | Interrogate one question at a time, sharpen terms, cross-reference code          | [grilling-guide.md](./references/grilling-guide.md)             |
| Write plan         | Create `~/.agents/sessions/{project}/{date}-{feature}/plan.md`                   | [plan-template.md](./references/plan-template.md)               |
| Add review         | `> quote` then `**Review (name):**`                                              | [review-patterns.md](./references/review-patterns.md)           |
| Resolve review     | `**Resolved:**` after the review block; update plan text above                   | [review-patterns.md](./references/review-patterns.md)           |
| Ask impl question  | `**Question (name):**` indented under the blocked task                           | [review-patterns.md](./references/review-patterns.md)           |
| Answer question    | `**Answer:**` directly below the question                                        | [review-patterns.md](./references/review-patterns.md)           |
| Run a phase        | Catch up on handoff → implement → verify Acceptance → review? → commit → handoff | [implementation-guide.md](./references/implementation-guide.md) |
| Check open threads | `grep -n "Review\|Resolved" plan.md` and `grep -n "Question\|Answer" plan.md`    |                                                                 |
