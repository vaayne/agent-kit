---
name: plan-review
description: >
  Plan-first development workflow that stress-tests ideas against the domain model,
  then manages the full plan lifecycle with inline reviews and phased implementation.
  Use this skill whenever the user wants to: write or review an implementation plan,
  grill or stress-test a design, challenge domain terminology, add or resolve review
  comments on a plan, track phased implementation progress, or audit open review threads.
  Also use when the user says things like "let's think this through", "poke holes in this",
  "what am I missing", "plan this out", or wants disciplined, reviewed code changes.
  Covers the full lifecycle: grilling → drafting → reviewing → resolving → implementing.
---

Plans live in `./.agents/sessions/{date}-{feature}/plan.md` where `{date}` is `YYYY-MM-DD` and `{feature}` is a short kebab-case label. The file is the single source of truth for the plan, review comments, questions, and handoff notes.

## Phase 0: Grilling

Stress-test the design before writing anything down. Read [grilling-guide.md](./references/grilling-guide.md) for the full process — interrogate one question at a time, challenge terms against `CONTEXT.md`, cross-reference with code, and update docs inline as decisions land.

Skip Phase 0 when the domain model and approach are already clear — small bug fixes, straightforward changes, or work where the plan is obvious don't need interrogation.

---

## Writing a plan

Follow the template in [plan-template.md](./references/plan-template.md). The key principle: explain **why**, not just what. For each significant decision, cover what you decided, what alternatives you ruled out, and what tradeoffs you accepted.

---

## Review and resolution

Reviews and questions use inline patterns documented in [review-patterns.md](./references/review-patterns.md). The key distinction:

- **Review comments** (`> quote` + `**Review:**`) — design critique, before work starts
- **Questions** (`**Question:**` indented under a task) — impl discoveries, need unblocking

Both are resolved inline. The plan text is the authoritative record; review/question threads are the audit trail.

---

## Implementation

Phase-by-phase execution with handoffs. Read [implementation-guide.md](./references/implementation-guide.md) before starting. The core loop:

1. Read `plan.md` to catch up
2. **Scout first** if the phase is complex — spawn a subagent to gather context (read files, trace dependencies, map blast radius) before writing code
3. **Commit after every phase** — each phase is its own reviewable, revertable unit
4. Update `plan.md` — mark tasks done, record changes, write handoff note
5. **Parallelize independent phases** — when phases touch disjoint files with no data dependency, run them simultaneously in separate subagents with their own worktrees
6. Domain-awareness behaviors from Phase 0 stay active throughout

---

## Quick reference

| Action             | What to do                                                                    | Reference                                                       |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Grill a design     | Interrogate one question at a time, challenge terms, cross-reference code     | [grilling-guide.md](./references/grilling-guide.md)             |
| Update glossary    | Edit `CONTEXT.md` inline as terms resolve                                     | [context-format.md](./references/context-format.md)             |
| Record a decision  | ADR only when hard-to-reverse + surprising + real tradeoff                    | [adr-format.md](./references/adr-format.md)                     |
| Write plan         | Create `./.agents/sessions/{date}-{feature}/plan.md`                          | [plan-template.md](./references/plan-template.md)               |
| Add review         | `> quote` then `**Review (name):**`                                           | [review-patterns.md](./references/review-patterns.md)           |
| Resolve review     | `**Resolved:**` after the review block; update plan text above                | [review-patterns.md](./references/review-patterns.md)           |
| Ask impl question  | `**Question (name):**` indented under the blocked task                        | [review-patterns.md](./references/review-patterns.md)           |
| Answer question    | `**Answer:**` directly below the question                                     | [review-patterns.md](./references/review-patterns.md)           |
| Start a phase      | Read `plan.md` first, scout if complex, then implement in a subagent          | [implementation-guide.md](./references/implementation-guide.md) |
| End a phase        | Commit code, update plan, write handoff note                                  | [implementation-guide.md](./references/implementation-guide.md) |
| Check open threads | `grep -n "Review\|Resolved" plan.md` and `grep -n "Question\|Answer" plan.md` |                                                                 |
