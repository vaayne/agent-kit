# Implementation Guide

Implementation is phase-by-phase. Each phase is its own catch-up → execute → document → commit cycle.

## Review gates

Pause for user approval at two points:

1. **After grilling, before writing the plan.** "Here's what I understand — should I write the plan?"
2. **After the plan is written, before implementation.** "Here's the plan — should I start building?"

Don't gate every individual phase — that slows things down for no benefit on routine work. But if a phase produces a surprising result or hits a major blocker, pause and ask before continuing.

## When to use subagents

Default to working inline. Only spawn subagents when the phase justifies the overhead:

- **Simple/small phase** → implement inline, self-review. No subagents needed.
- **Complex phase** → spawn a scout subagent to gather context first, then a worker subagent to implement. See [worker.md](./agents/worker.md).
- **High-risk phase** → spawn a reviewer subagent after implementation to catch issues before committing. See [reviewer.md](./agents/reviewer.md).

The judgment call: if you'd be comfortable implementing and reviewing the phase yourself in a few minutes, do it inline. If the phase touches unfamiliar code, has unclear dependencies, or could break things in non-obvious ways, use subagents.

## Phase workflow

For every phase:

1. **Read `plan.md` first — especially the prior phase's handoff note.** That note exists precisely to bootstrap you: what landed, what surprises were found, what to verify first, which decisions were made that aren't in the plan body. Also catch up on task state, review decisions, open questions. Note the phase's **Acceptance** block — that's the bar to clear.
2. **Scout if the phase is complex.** Spawn a subagent to read relevant files, trace call chains, check test coverage, or map the blast radius. Use its findings to refine tasks before writing code.
3. **Implement.** Either inline or in a worker subagent — see "When to use subagents" above. Keep focus on the current phase only.
4. **Verify against Acceptance.** Run every check listed in the phase's Acceptance block and capture the actual result (command output, test count, screenshot path, manual observation). A phase is not done until every acceptance item is verified — if a check can't be run, say so explicitly and escalate rather than skipping silently.
5. **Review if high-risk.** Spawn a reviewer subagent for phases that touch critical paths or could fail silently. Skip for routine work.
6. **Commit after every phase.** Each phase produces its own commit — a reviewable, revertable unit. Don't batch multiple phases into one commit, and don't defer commits until the end.
7. **Update `plan.md` after the commit — and write the handoff note.** Mark completed tasks, record decision changes, then write the phase handoff note. The handoff is mandatory; see "Phase handoff" below for the required fields. A phase without a handoff is not done.
8. **Do not commit `plan.md`.** The working tree should reflect the latest state, but `plan.md` itself doesn't need to be in git history.

## Escalation

If a phase requires major rework — not just small fixes, but rethinking the approach — pause and ask the user for guidance. Don't start the next phase until the rework is resolved. This prevents wasted effort building on a shaky foundation.

## Parallel phases

When phases have no dependency on each other — neither reads the other's output, neither modifies files the other touches — run them in parallel using multiple subagents. Each subagent gets its own worktree so they don't conflict.

How to decide:

- **Sequential** (default): Phase N depends on Phase N-1's output, modifies overlapping files, or needs the compiler/type-checker to verify the prior phase first.
- **Parallel**: Phases touch disjoint files and have no data dependency. Common examples: migrating independent plugins, adding tests for separate modules, updating docs while code changes land elsewhere.

When running parallel phases, commit each one independently when its subagent finishes — don't wait for all to complete. Update `plan.md` after each commit, noting which phases ran in parallel.

## Domain awareness carries through

The grilling behaviors from Phase 0 re-activate during implementation:

- If new or ambiguous terminology surfaces during review, challenge it against `CONTEXT.md`.
- If a resolved review constitutes a hard-to-reverse, surprising, real-tradeoff choice, offer an ADR.
- If a resolved review changes domain language, update `CONTEXT.md` inline.

## Progress tracking

Change `- [ ]` to `- [x]` as each task is completed. Don't delete completed tasks — the history is useful context for reviewers and for anyone picking up a stalled branch.

## Phase handoff

Every phase ends with a handoff note in `plan.md`. **This is non-negotiable** — no handoff, no "phase done". The handoff is how context survives the boundary between phases (and between sessions, and between humans). Without it, the next phase re-derives what the prior one already learned, or worse, silently contradicts it.

The next phase's step 1 is to read this note. Write it for that reader: someone who has the plan but not your last hour of context. Be specific about what they'd otherwise have to rediscover.

```markdown
#### Handoff after Phase N

- **What landed** — files/modules touched, new symbols or endpoints introduced
- **Acceptance results** — each check from the Acceptance block with its actual outcome (e.g. `pytest tests/foo -k bar` → 12 passed; manual: login flow renders error toast on bad password)
- **Decisions made during impl** — anything resolved on the fly that wasn't in the plan (e.g. "chose `useReducer` over Zustand for the form — Zustand pulled in too much for one screen")
- **Surprises / gotchas** — non-obvious things the next implementer would otherwise hit (e.g. "the `auth/` test suite needs `DATABASE_URL` set even though it mocks the DB — pytest fixture eagerly loads settings")
- **What changed from the original plan** — link to any tasks added/removed/reordered
- **What is still open** — unresolved questions, deferred TODOs with rationale, follow-up phases
- **What the next phase should read or verify first** — file paths, specific tests to rerun, invariants to recheck
```

Keep each bullet tight — one or two lines. Skip a bullet only if it genuinely doesn't apply (e.g. no surprises this phase). Empty handoffs ("nothing to note") are a smell: either the phase was trivial enough that it didn't need to be its own phase, or you're losing context. Reread the phase's diff before writing — you almost always discovered something worth recording.

## Tasks format

Each phase groups related work with checkboxes, plus an **Acceptance** block that defines "done". Add a "Why this phase?" note when grouping or sequence isn't self-evident.

Acceptance criteria are the bar the phase must clear before commit. Write them as **observable, runnable checks** — not restatements of the tasks. Good: "`pnpm test auth/` passes with the new login test green", "manual: submitting an empty form shows the inline error and no network request fires", "`rg 'OldName' src/` returns zero matches". Bad: "login works", "code is clean", "tests pass" (which tests? what assertion?). If a criterion can't be expressed as something you can run or directly observe, sharpen it until it can.

Aim for 2–5 criteria per phase. Cover the happy path, at least one edge case or failure mode the phase is responsible for, and any non-functional bar that matters (perf budget, no regressions in adjacent tests, type-check clean). If a phase is purely mechanical (rename, file move), one criterion is fine.

```markdown
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
```
