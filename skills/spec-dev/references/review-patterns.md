# Review and Question Patterns

Two distinct inline patterns keep design critique separate from implementation blockers.

## Review comments (design critique)

Reviewers add comments directly into `plan.md`. The `> quote` anchors the comment to a specific passage.

```markdown
> exact sentence or passage being challenged

**Review (name):** The concern or question, with enough context that the author
understands what specifically is being challenged and why.
```

Place the comment block immediately after the passage it refers to, not at the bottom of the file.

**Example:**

```markdown
> If they want different versions, last-writer-wins is acceptable

**Review (alice):** Silent last-writer-wins seems risky — if plugin A pins
`tap@0.4.4` and plugin B pins `tap@0.5.0`, whichever enables last wins and
the other silently runs the wrong version. Should we at least log a warning?
```

## Resolving a review

Add a `**Resolved:**` line after the `**Review:**` block. Update the plan text above to reflect the decision.

```markdown
> exact sentence or passage being challenged

**Review (name):** The original concern.

**Resolved:** What changed and why. One or two sentences is enough — the updated
plan text above is the authoritative record; this line just closes the loop.
```

If the review was considered but rejected, still add `**Resolved:**` explaining why — so the reviewer knows it was deliberate, not an oversight.

## Questions and blockers (during implementation)

When the implementer hits something the plan didn't anticipate, record it inline on the relevant task using `**Question:**`. Indent with two spaces so it stays attached:

```markdown
- [ ] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed. Be specific:
      include the file, the actual code shape, what the two options are.
```

Respond with `**Answer:**` directly below:

```markdown
- [ ] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed.
      **Answer:** The decision and the reason. If it changes the plan, update the
      relevant section above and note it here.
```

Once answered, check off the task when done:

```markdown
- [x] Task E — _why this step matters_
      **Question (name):** What we found and what decision is needed.
      **Answer:** The decision and reason.
```

**Why two patterns?** Review comments challenge decisions before work starts. Questions report discoveries mid-implementation that need unblocking. Keeping them distinct makes it easy to scan the file and tell pre-impl concerns from mid-impl blockers.

**When a question changes the plan:** Update the affected section's prose or task list, then note what changed in the Answer.

## Reviewing tasks

Use the same quote + Review + Resolved pattern on task lines:

```markdown
> - [ ] Task E — _why this step matters_

**Review (bob):** This should come before Task D — Task E sets up the scaffold
that Task D depends on, not the other way around.

**Resolved:** Swapped the order. Task E now precedes Task D in Phase 2.
```

## Checking open threads

```bash
# Reviews (design critique): unmatched Review = still contested
grep -n "Review\|Resolved" plan.md

# Questions (impl blockers): unmatched Question = still blocked
grep -n "Question\|Answer" plan.md
```

Every `**Review**` or `**Question**` line not immediately followed by its closing keyword is still open.
