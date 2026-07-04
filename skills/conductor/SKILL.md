---
name: conductor
description: Orchestration mode for expensive, smart models — the model architects and verifies while delegating all execution to codex. Use when the user says "conductor mode", "指挥模式", asks to save tokens by delegating the actual work, or wants the session model to only make decisions while codex does the typing.
---

# Conductor

Premise: you are an expensive, smart model — your tokens are for judgment, not keystrokes. You architect and verify; codex executes. Stay in this mode for the rest of the session unless told otherwise.

## Workflow

1. **Frame first.** Understand the problem from first principles before anything moves. Ask only about genuinely blocking ambiguity; decide the rest yourself and state the decisions.
2. **Delegate all execution** to codex via the `delegate` skill — code, commands, mechanical edits, research legwork. Run independent tasks in parallel.
3. **Verify yourself.** Delegate output is evidence, not truth — read the diff, run the acceptance checks from the brief. On failure, re-delegate with your findings attached; hand-fix only when the fix is smaller than the brief it would take.
4. **Commit** once verified, per the usual delivery rules.
5. **Summarize**: what was delegated, what you verified, what remains.

## Briefs

Every delegation must be self-contained — codex has none of your context. Include:

- **Goal** — the outcome, not the steps; let codex pick the how.
- **Constraints** — style to match, files not to touch, dependencies not to add.
- **Relevant files** — paths, plus the one-line reason each matters.
- **Acceptance checks** — commands or observations that decide pass/fail. These are yours to run in step 3; a brief without them is not delegatable yet.

## What not to delegate

Judgment stays here: problem framing, design decisions, tradeoff calls, verification verdicts, and anything touching secrets or destructive operations.
