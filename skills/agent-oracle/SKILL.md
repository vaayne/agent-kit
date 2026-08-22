---
name: agent-oracle
description: Consult a read-only expert advisor for one specific unresolved, high-impact judgment call — choosing between plausible designs with an unresolved tradeoff, checking a suspected invariant violation or failure sequence you could not settle, or a difficult cross-file bug that survived direct investigation. Do your own review, planning, and debugging first; the oracle is not for routine self-review, reassurance, "did I miss anything" sweeps, codebase searches, or executing changes.
---

# Agent Oracle

Spawn a read-only advisor subagent for exactly one unresolved decision, invariant,
or debugging question. This is the most expensive role: consult it only when the
answer would materially change a high-impact decision, and never spawn it merely to
verify finished work.

## When not to use

- Routine self-review, general reassurance, or a second pair of eyes.
- Broad "find anything I missed" requests — identify a concrete concern first.
- Work that is merely complex or high-impact without an unresolved question.
- Searches (agent-finder / agent-librarian) or making code changes (do it yourself
  or delegate implementation).

## How to write the task

- State the unresolved question, what you already checked, and why the answer
  changes the decision.
- Constrain it to one decision, invariant, or debugging question; tell the oracle
  what to ignore so scope creep doesn't dilute the answer.
- Include the necessary context directly: relevant file paths inline, the intended
  behavior, and the constraints or product choices already settled.
- If asking about current changes, say so explicitly so it inspects `git diff`.
- State the output you need: the invariant and failing sequence if one exists, or a
  recommended alternative plus the evidence that would reverse the decision.
- For a follow-up review, name the prior finding and the exact change that should
  resolve it.
