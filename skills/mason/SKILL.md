---
name: mason
description: >
  Execute an existing plan.md phase by phase — catch up from the prior handoff,
  implement, verify the Acceptance block, review if warranted, commit, write the
  next handoff. Use when the user says "implement the plan", "execute the plan",
  "continue the plan", "next phase", "按计划实现", picks up a stalled plan in a
  fresh session, or as the Impl step of the spec-dev workflow.
---

# Mason

Build what the blueprint says. Input is a `plan.md` written per the `blueprint` skill (structure, Acceptance blocks, and handoff format live in [../blueprint/references/plan-template.md](../blueprint/references/plan-template.md)). Implementation is phase-by-phase; each phase is its own catch-up → execute → verify → review-if-needed → commit → handoff cycle.

## Phase workflow

1. **Read `plan.md` first — especially the prior phase's handoff note.** It exists to bootstrap you: what landed, what surprised, what to verify first, which decisions aren't in the plan body. Note the phase's **Acceptance** block — that's the bar.
2. **Scout if the phase is complex.** Read relevant files, trace call chains, map the blast radius; refine tasks before writing code.
3. **Implement.** Stay inside the current phase. Work discovered outside scope goes in the handoff, not into the phase.
4. **Verify against Acceptance.** Run every check and capture the actual result (command output, test count, screenshot path, manual observation). If a check can't be run, say so and escalate — never skip silently.
5. **Decide whether to review.** Trivial or mechanical → self-review the diff and move on. Touches critical paths, security, data, or non-obvious logic → review before commit. Uncertain → review; cheap insurance.
6. **Commit.** One phase, one reviewable, revertable commit. Don't batch phases; don't defer commits to the end.
7. **Update `plan.md` and append the handoff note.** Mark completed tasks, record decision changes, append to **Handoffs** per the template. No handoff, no "phase done".

> `plan.md` itself is not committed — the working tree reflects the latest state, but the file doesn't belong in git history.

## Deviations and escalation

Unknowns surface mid-flight no matter how good the plan. On hitting one: pick the conservative option, record it in the handoff's "decisions made during impl", and keep going. If the deviation means rethinking the approach — not a small fix — pause and ask before building further; a bad foundation compounds. Same rule for surprising results at any step.

If a phase surfaces ambiguous terms or a design corner the plan glossed over, interrogate it (the `grill` skill's habits apply), then update the affected plan section — `plan.md` is the single source of truth and should evolve as you learn.

## Parallel phases

Phases with no dependency — neither reads the other's output nor touches the same files — can run in parallel, each branch in its own worktree.

- **Sequential (default):** Phase N needs Phase N-1's output, overlaps files, or needs the type-checker to validate the prior phase first.
- **Parallel:** disjoint files, no data dependency — independent plugin migrations, tests for separate modules, docs alongside code.

Commit each parallel phase as it finishes; update `plan.md` after each commit and note the parallelism in the handoff.
