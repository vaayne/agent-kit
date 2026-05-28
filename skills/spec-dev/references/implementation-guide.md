# Implementation Guide

How to _execute_ a plan. The plan's structure (Tasks, Acceptance, Handoffs) is documented in [plan-template.md](./plan-template.md) — this file covers the per-phase workflow, when to pause, and when to escalate.

Implementation is phase-by-phase. Each phase is its own catch-up → execute → verify → review-if-needed → commit → handoff cycle.

## Review gates

Pause for user approval at two points:

1. **After grilling, before writing the plan.** "Here's what I understand — should I write the plan?"
2. **After the plan is written, before implementation.** "Here's the plan — should I start building?"

Within implementation, don't gate every individual phase — that slows things down for no benefit on routine work. But if a phase produces a surprising result or hits a major blocker, pause and ask before continuing.

## Phase workflow

For every phase:

1. **Read `plan.md` first — especially the prior phase's handoff note.** That note exists to bootstrap you: what landed, what surprises were found, what to verify first, which decisions were made that aren't in the plan body. Also catch up on task state, review decisions, open questions. Note the phase's **Acceptance** block — that's the bar to clear.
2. **Scout if the phase is complex.** Read relevant files, trace call chains, check test coverage, or map the blast radius. Use the findings to refine tasks before writing code.
3. **Implement.** Stay focused on the current phase. If you discover work outside scope, note it in the handoff rather than expanding the phase.
4. **Verify against Acceptance.** Run every check listed in the phase's Acceptance block and capture the actual result (command output, test count, screenshot path, manual observation). A phase is not done until every acceptance item is verified — if a check can't be run, say so explicitly and escalate rather than skipping silently.
5. **Decide whether to review.** Per-phase judgment call — see "Per-phase review decision" below. If yes, do the review before committing.
6. **Commit.** Each phase produces its own commit — a reviewable, revertable unit. Don't batch multiple phases into one commit, and don't defer commits until the end.
7. **Update `plan.md` and write the handoff note.** Mark completed tasks, record decision changes, then append a new entry to the **Handoffs** section using the template in [plan-template.md](./plan-template.md). The handoff is mandatory; a phase without one is not done.

> `plan.md` itself is not committed — the working tree reflects the latest state, but the file doesn't need to be in git history.

## Per-phase review decision

Review is not a fixed step — decide per phase whether the work needs another pass before moving on:

- **Trivial / mechanical phase** → self-review the diff and move on.
- **Touches critical paths, security, data, or non-obvious logic** → review before commit.
- **You're uncertain whether you got it right** → review. Cheap insurance.

When in doubt, lean toward reviewing. The next phase shouldn't start until you're confident the current one is solid — a bad foundation compounds.

## Escalation

If a phase requires major rework — not just small fixes, but rethinking the approach — pause and ask the user for guidance. Don't start the next phase until the rework is resolved. This prevents wasted effort building on a shaky foundation.

## Parallel phases

When phases have no dependency on each other — neither reads the other's output, neither modifies files the other touches — they can run in parallel. Each parallel branch should use its own worktree to avoid conflicts.

How to decide:

- **Sequential** (default): Phase N depends on Phase N-1's output, modifies overlapping files, or needs the compiler/type-checker to verify the prior phase first.
- **Parallel**: Phases touch disjoint files and have no data dependency. Common examples: migrating independent plugins, adding tests for separate modules, updating docs while code changes land elsewhere.

When running parallel phases, commit each one independently as it finishes — don't wait for all to complete. Update `plan.md` after each commit, noting in the handoff that the phase ran in parallel.

## Grilling carries through

The grilling habits from the Grill step stay on during implementation. If a phase surfaces ambiguous terminology, hidden assumptions, or a design corner the plan glossed over, interrogate it the same way — challenge it, resolve it, then update the relevant section of `plan.md` so the resolution is recorded. The plan is the single source of truth and it should evolve as you learn.
