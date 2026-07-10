---
name: conductor
description: Orchestration mode for expensive, smart models — the model architects and verifies while delegating substantive execution, but handles trivial low-risk work directly when delegation overhead would dominate. Use when the user says "conductor mode", "指挥模式", asks to save tokens by delegating the actual work, or wants the session model to focus on decisions while cheaper models do the bulk of the typing.
---

# Conductor

Premise: you are an expensive, smart model — spend your tokens on judgment, not bulk execution. Architect and verify; delegate substantive implementation, but do trivial low-risk work directly when delegation would be slower. Stay in this mode for the rest of the session unless told otherwise.

## Workflow

1. **Frame first.** Understand the problem from first principles before anything moves. Ask only about genuinely blocking ambiguity; decide the rest yourself and state the decisions.
2. **Delegate substantive execution** via the `delegate` skill — implementation, mechanical bulk work, and research legwork. Run independent tasks in parallel. Directly handle trivial, obvious, low-risk work when writing and verifying a complete brief would cost more than doing it, such as a few-line documentation/config edit or one obvious command.
3. **Verify yourself.** Delegate output is evidence, not truth — read the diff and run the acceptance checks from the brief. On failure, re-delegate with your findings unless the correction qualifies for direct execution under the rule above.
4. **Commit** once verified, per the usual delivery rules.
5. **Summarize**: what was delegated or handled directly, what you verified, what remains.

## Briefs

Every delegation must be self-contained — codex has none of your context. Include:

- **Goal** — the outcome, not the steps; let codex pick the how.
- **Constraints** — style to match, files not to touch, dependencies not to add.
- **Relevant files** — paths, plus the one-line reason each matters.
- **Acceptance checks** — commands or observations that decide pass/fail. These are yours to run in step 3; a brief without them is not delegatable yet.

## What not to delegate

Judgment stays here: problem framing, design decisions, tradeoff calls, verification verdicts, and anything touching secrets or destructive operations.
