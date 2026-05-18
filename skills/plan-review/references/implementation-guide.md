# Implementation Guide

Implementation is phase-by-phase. Each phase is its own catch-up → execute → document → commit cycle.

## Phase workflow

For every phase:

1. **Read `plan.md` first.** Reread to catch up on task state, prior review decisions, open questions, and the previous phase's handoff notes.
2. **Scout if the phase is complex.** If a phase touches unfamiliar code, has unclear dependencies, or is large enough that you'd hesitate to start coding immediately — spawn a subagent to gather context first. Have it read the relevant files, trace call chains, check test coverage, or map the blast radius. Use its findings to refine the phase tasks before writing any code. This is cheap insurance against rework.
3. **Implement in a subagent.** Keep the subagent focused on the current phase rather than the whole project. Give it the plan, the scout findings (if any), and the specific tasks.
4. **Commit after every phase.** Each phase produces its own commit — a reviewable, revertable unit. Don't batch multiple phases into one commit, and don't defer commits until the end.
5. **Update `plan.md` after the commit.** Mark completed tasks, record decision changes, add the phase handoff note.
6. **Do not commit `plan.md`.** The working tree should reflect the latest state, but `plan.md` itself doesn't need to be in git history.

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

At the end of every phase, write a short handoff note in `plan.md`:

```markdown
#### Handoff after Phase N

- What landed
- What changed from the original plan
- What is still open
- What the next phase should read or verify first
```

Keep it short but specific. The next implementer or subagent should be able to read the handoff and continue from the plan file alone.

## Tasks format

Each phase groups related work with checkboxes. Add a "Why this phase?" note when grouping or sequence isn't self-evident.

```markdown
## Tasks

### Phase 1: <name>

<!-- Why this phase comes first, if not obvious -->

- [ ] Task A
- [ ] Task B — _why this specific step matters or must precede the next_
- [ ] Task C

### Phase 2: <name>

<!-- Why after Phase 1 -->

- [ ] Task D
- [ ] Task E
```
