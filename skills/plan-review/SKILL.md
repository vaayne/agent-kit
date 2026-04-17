---
name: plan-review
description: >
  Write implementation plans to a markdown file and manage inline review comments on them.
  Use this skill whenever the user asks to write a plan, add a review comment to a plan,
  resolve a review comment, or check what review comments are still open. Also use it
  when a reviewer pushes back on something in a plan and you need to record the decision.
  The skill covers the full lifecycle: drafting → reviewing → resolving → auditing.
---

## What this skill does

Plans are written to a `plan.md` file (or a named file the user specifies). Review comments live inline in that same file — no separate threads, no external tools. The file is the single source of truth for both the plan and its review history.

---

## Writing a plan

A useful plan explains **why**, not just what. Anyone reading it later — including a reviewer or a future you — should be able to reconstruct the reasoning without access to the original conversation.

For each significant decision, cover:

- What you decided
- What alternatives you considered and why you ruled them out
- What tradeoffs you accepted and why they're acceptable

This is more work upfront but eliminates the most common review failure mode: "why did you do it this way?" when the answer was obvious in context but undocumented.

**Structure to follow:**

```
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
Phase-by-phase breakdown of the work. See the Tasks section below for format.
```

Not every plan needs every section. Small plans can compress. The goal is that
a reader who wasn't in the original conversation can understand and critique it.

---

## Adding a review comment

Reviewers add comments directly into `plan.md`. The format is:

```markdown
> exact sentence or passage being challenged

**Review (name):** The concern or question, with enough context that the author
understands what specifically is being challenged and why.
```

The `> quote` anchors the comment to a specific part of the plan. Without it,
"I'm not sure about the manifest design" is ambiguous. With it, there's no
confusion about what's being questioned.

**Example:**

```markdown
> If they want different versions, last-writer-wins is acceptable

**Review (alice):** Silent last-writer-wins seems risky — if plugin A pins
`tap@0.4.4` and plugin B pins `tap@0.5.0`, whichever enables last wins and
the other silently runs the wrong version. Should we at least log a warning?
```

Place the comment block immediately after the passage it refers to, not at the
bottom of the file. Keeping concern and context together makes resolution easier.

---

## Resolving a review comment

When a review leads to a change in the plan, add a `**Resolved:**` line directly
after the `**Review:**` block. Update the plan text above it to reflect the decision.

```markdown
> exact sentence or passage being challenged

**Review (name):** The original concern.

**Resolved:** What changed and why. One or two sentences is enough — the updated
plan text above is the authoritative record; this line just closes the loop.
```

**Example:**

```markdown
> If they want different versions, last-writer-wins is acceptable

**Review (alice):** Silent last-writer-wins seems risky — if plugin A pins
`tap@0.4.4` and plugin B pins `tap@0.5.0`, whichever enables last wins and
the other silently runs the wrong version. Should we at least log a warning?

**Resolved:** Agreed — added a version conflict warning in `EnsurePluginBinaries`:
if the requested version differs from the manifest, log a `slog.Warn` with both
plugin IDs and versions before proceeding.
```

If the review was considered but rejected (the plan stays as-is), still add a
`**Resolved:**` line explaining why — so the reviewer knows the concern was read
and the decision was deliberate, not an oversight.

---

## Tasks

The Tasks section breaks the plan into concrete phases. Each phase groups related
work and explains why it comes in that order. Individual tasks have checkboxes so
progress is visible at a glance. Add a "Why this phase?" note when the grouping
or sequence isn't self-evident.

**Format:**

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

**Example:**

```markdown
## Tasks

### Phase 1: Extend the public interface

<!-- Do this before touching internals so the compiler enforces all callsites
     are updated before we delete the old API. -->

- [ ] Add `BinaryAsset`, `BinarySpec` to `pkg/plugins/types.go`
- [ ] Add `CapabilityBinary` to `pkg/plugins/capabilities.go`
- [ ] Add `AddBinary(BinarySpec)` to the `Host` interface

### Phase 2: Implement in PluginHost

<!-- Depends on Phase 1 — interface must exist before we implement it. -->

- [ ] Add `binaryRegs map[string][]BinarySpec` field to host struct
- [ ] Implement `AddBinary`, derive `CapabilityBinary`
- [ ] Add `BinarySpecs(pluginID string) []BinarySpec` accessor

### Phase 3: Replace internal tools plumbing

<!-- Depends on Phase 2 — new accessor must exist before callers can use it. -->

- [ ] Add `EnsurePluginBinaries` and `RunPostInstalls` to `internal/tools/`
- [ ] Update `cmd/anna/plugin.go`, `commands.go`, `admin/plugins.go`

### Phase 4: Migrate plugins

- [ ] `plugins/tools/tap-web` — add `host.AddBinary`, remove `RegisterPluginPostInstall`
- [ ] `plugins/hooks/rtk` — add `host.AddBinary`

### Phase 5: Delete dead code

<!-- Last, so the compiler surfaces any missed callsites during Phases 3–4. -->

- [ ] Remove `registry.json`, `pluginToolMap`, `pluginPostInstall`
- [ ] Remove `RegisterPluginPostInstall`, `EnsurePluginTool`, `RunPluginPostInstall`
- [ ] Remove `Registry`, `DownloadAll`, `FindTool`
```

**Marking tasks done:** Check the box — `- [x]` — as work completes. Don't delete
completed tasks; the strikethrough history shows what's been done and in what order.

**Reviewing tasks:** Use the same quote + Review + Resolved pattern on task lines.
Quote the task text, add the comment below it. This keeps task-level concerns
attached to the task rather than floating at the bottom of the file.

```markdown
> - [ ] Task E — _why this step matters_

**Review (bob):** This should come before Task D — Task E sets up the scaffold
that Task D depends on, not the other way around.

**Resolved:** Swapped the order. Task E now precedes Task D in Phase 2.
```

---

## During implementation

Two things happen during impl that need to be recorded in the plan:

### 1. Progress — check off tasks

Change `- [ ]` to `- [x]` as each task is completed. Don't delete completed
tasks; the history of what's been done and in what order is useful context for
reviewers and for anyone picking up a stalled branch.

### 2. Questions and blockers

When the implementer hits something the plan didn't anticipate — an assumption
that turned out to be wrong, a decision that needs clarification before
continuing — record it inline on the relevant task using `**Question:**`.
Indent with two spaces so the question stays attached to its task in markdown:

```markdown
- [ ] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed. Be specific:
      include the file, the actual code shape, what the two options are.
```

The original author (or whoever owns the decision) responds with `**Answer:**`
directly below it:

```markdown
- [ ] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed.
      **Answer:** The decision and the reason. If it changes the plan, update the
      relevant section above and note it here.
```

Once answered, the implementer continues and checks off the task when done:

```markdown
- [x] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed.
      **Answer:** The decision and reason.
```

**Why not reuse the Review pattern?** Review comments (`> quote` + `**Review:**`)
are for design critique — they challenge a decision before work starts. Questions
during impl are different in nature: the implementer isn't pushing back, they're
reporting a discovery and need to unblock. Keeping the two patterns distinct makes
it easy to scan the file and tell pre-impl concerns from mid-impl blockers.

**When a question changes the plan:** Update the affected section's prose or task
list to reflect the new decision, then add a short note in the Answer explaining
what changed. The plan text is the authoritative record; the Question/Answer thread
is the audit trail.

---

## Checking open threads

Both patterns use a consistent keyword, so a single grep shows everything at once:

```bash
# Reviews (design critique): unmatched Review = still contested
grep -n "Review\|Resolved" plan.md

# Questions (impl blockers): unmatched Question = still blocked
grep -n "Question\|Answer" plan.md
```

Each command prints numbered lines. Scan down: every `**Review**` or `**Question**`
line that isn't immediately followed by its closing keyword is still open. Eyeballing
a short list is more reliable than a clever pipeline that can silently misfire.

---

## Quick reference

| Action               | What to do                                                                           |
| -------------------- | ------------------------------------------------------------------------------------ |
| Write plan           | Create `plan.md` with problem, reasoning, decisions, implementation order, and Tasks |
| Add task phase       | `### Phase N: name` with checkbox items; include why if order isn't obvious          |
| Mark task done       | Change `- [ ]` to `- [x]`; don't delete completed tasks                              |
| Add review comment   | Quote passage with `>`, then `**Review (name):**` below it                           |
| Resolve review       | Add `**Resolved:**` after the `**Review:**` block; update text above                 |
| Reject a review      | Still add `**Resolved:**` explaining why the plan stays as-is                        |
| Ask impl question    | Add `**Question (name):**` indented under the blocked task                           |
| Answer impl question | Add `**Answer:**` directly below the `**Question:**` line                            |
| Check open reviews   | `grep -n "Review\|Resolved" plan.md` — unmatched Review lines are open               |
| Check open questions | `grep -n "Question\|Answer" plan.md` — unmatched Question lines are open             |
