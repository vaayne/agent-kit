# Plan Template

`plan.md` is the single artifact for this skill. It holds the design, the phased task breakdown, inline reviews, mid-impl questions, and the handoff note left after each phase finishes.

A useful plan explains **why**, not just what. For each significant decision, cover what you decided, what alternatives you ruled out and why, and what tradeoffs you accepted. The goal is that a reader who wasn't in the original conversation can understand and critique it.

Not every plan needs every section. Small plans can compress — drop sections that don't apply.

## Skeleton

```markdown
# Plan: <short title>

## Problem

What is broken or missing and why it matters.

## How we got here

What you read or explored to understand the current state. This gives reviewers
confidence that the plan is grounded in the actual codebase, not assumptions.

## Design decisions

One section per significant decision. For each:

- What was decided
- What alternatives were ruled out and why
- What tradeoffs were accepted

## What changes where

Concrete list: file → what changes. Enough detail that a reviewer can follow
without reading the code themselves.

## Migration / implementation order

Sequenced steps. Include the reason for the sequence when it isn't obvious
(e.g. "step 8 is last so the compiler catches missed callsites").

## Tasks

### Phase 1: <name>

<!-- Why this phase comes first, if not obvious -->

- [ ] Task A
- [ ] Task B — _why this specific step matters or must precede the next_
- [ ] Task C

**Acceptance:**

- [ ] `<command>` exits 0 / produces `<expected output>`
- [ ] `<observable behavior>` when `<trigger>` — e.g. "401 returned when token is expired"
- [ ] No regressions: `<broader test command>` still green

### Phase 2: <name>

<!-- Why after Phase 1 -->

- [ ] Task D
- [ ] Task E

**Acceptance:**

- [ ] …

## Handoffs

<!-- Filled in as each phase completes. One entry per phase. -->
```

## Tasks section

Each phase groups related work with checkboxes, plus an **Acceptance** block that defines "done". Add a "Why this phase?" note when grouping or sequence isn't self-evident.

Change `- [ ]` to `- [x]` as each task completes. Don't delete completed tasks — the history is useful context for reviewers and for anyone picking up a stalled branch.

### Writing Acceptance criteria

Acceptance is the bar the phase must clear before commit. Write criteria as **observable, runnable checks** — not restatements of the tasks.

- **Good:** "`pnpm test auth/` passes with the new login test green", "manual: submitting an empty form shows the inline error and no network request fires", "`rg 'OldName' src/` returns zero matches".
- **Bad:** "login works", "code is clean", "tests pass" (which tests? what assertion?).

If a criterion can't be expressed as something you can run or directly observe, sharpen it until it can.

Aim for 2–5 criteria per phase. Cover the happy path, at least one edge case or failure mode the phase is responsible for, and any non-functional bar that matters (perf budget, no regressions in adjacent tests, type-check clean). Purely mechanical phases (rename, file move) can have one criterion.

## Writing the handoff note

Every phase ends with a handoff note appended to the **Handoffs** section. **This is non-negotiable** — no handoff, no "phase done". The handoff is how context survives the boundary between phases (and between sessions, and between humans). Without it, the next phase re-derives what the prior one already learned, or worse, silently contradicts it.

The next phase's first action is to read this note. Write it for that reader: someone who has the plan but not your last hour of context. Be specific about what they'd otherwise have to rediscover.

```markdown
### Handoff after Phase N

- **What landed** — files/modules touched, new symbols or endpoints introduced
- **Acceptance results** — each check from the Acceptance block with its actual outcome (e.g. `pytest tests/foo -k bar` → 12 passed; manual: login flow renders error toast on bad password)
- **Decisions made during impl** — anything resolved on the fly that wasn't in the plan (e.g. "chose `useReducer` over Zustand for the form — Zustand pulled in too much for one screen")
- **Surprises / gotchas** — non-obvious things the next implementer would otherwise hit (e.g. "the `auth/` test suite needs `DATABASE_URL` set even though it mocks the DB — pytest fixture eagerly loads settings")
- **What changed from the original plan** — link to any tasks added/removed/reordered
- **What is still open** — unresolved questions, deferred TODOs with rationale, follow-up phases
- **What the next phase should read or verify first** — file paths, specific tests to rerun, invariants to recheck
```

Keep each bullet tight — one or two lines. Skip a bullet only if it genuinely doesn't apply (e.g. no surprises this phase). Empty handoffs ("nothing to note") are a smell: either the phase was trivial enough that it didn't need to be its own phase, or you're losing context. Reread the phase's diff before writing — you almost always discovered something worth recording.

## Inline reviews and questions

Plan reviews and mid-impl questions are inlined directly in the relevant section of this file — they don't get their own files. See [review-patterns.md](./review-patterns.md) for the `> quote` + `**Review:**` / `**Resolved:**` and `**Question:**` / `**Answer:**` syntaxes.
