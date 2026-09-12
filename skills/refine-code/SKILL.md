---
name: refine-code
description: Simplify or refactor existing code, improve architecture, or identify safe deletions. Use for requested code cleanup, complexity reduction, or refactoring assessments.
---

# Refine Code

Reduce the effort needed to understand and maintain existing code while preserving its observable behavior and supported contracts. Rank improvements by cognitive load removed, not lines deleted.

## Scope and authorization

Apply the user's intent to every mode:

- Assess, audit, find, review, or report: inspect and propose; do not edit code, docs, or configuration.
- Refactor, simplify, apply, clean up, or delete: implement the requested changes and verify them. Do not stop at suggestions or ask again merely because a change crosses files.
- Continue within existing authorization. Ask only for an unresolved choice that materially changes scope, safety, supported behavior, or a hard-to-reverse decision. Prepare the concrete alternatives first.

Use the files, revisions, and boundaries the user named. For recent work, inspect Git status and the relevant staged, unstaged, committed, and untracked changes. Preserve unrelated work. Read applicable repository instructions; consult neighboring code and decision records only where they explain the change in question.

## Choose the relevant guidance

- **Code:** local readability, types, and organization. Use the guidance below.
- **Architecture:** coupling, module responsibilities, or testability. Read [references/ARCHITECTURE.md](references/ARCHITECTURE.md).
- **Entropy:** dead code, duplicate state, unused configuration, or safe deletions. Read [references/ENTROPY.md](references/ENTROPY.md) for consumer and compatibility checks.

Combine only the guidance the task needs; there is no mandatory mode sequence. If local friction has a structural cause, explain it and address it within scope. A broader redesign requires a separate decision only when it exceeds the request.

## Code

Use these questions where they expose a concrete improvement:

- **Deletion:** if the abstraction vanished, would complexity disappear or move into callers? Keep it when it hides needed knowledge, ownership, or policy.
- **Reading:** where must a maintainer keep scattered facts in mind? Bring related logic together or name a meaningful intermediate value.
- **Types:** do types accurately represent runtime values? Narrow only with evidence from producers and consumers; static types alone do not prove external input or persisted data safe.

Prefer changes that simplify actual callers: accurate types that eliminate casts, cohesive logic, clearer names, and proved redundant branches. Do not add features, fallback behavior, logging, or speculative extension points as part of cleanup. Preserve validation at trust boundaries and existing compatibility obligations.

For assessment, give the strongest candidates with locations, concrete friction, proposed change, and risk. Use a before/after example when it helps assess the benefit; no fixed table or snippet quota. For implementation, make the changes and report the resulting behavior and verification.

## Verification and handoff

Verify the surviving contract with checks proportional to the change and repository requirements. Retain meaningful coverage; a simpler implementation does not by itself justify deleting tests. Once checks pass, repeat them only for new changes or unresolved risk.

Use project terminology. Delegation is optional for useful independent work; follow the host's orchestration rules, using bb child threads inside bb. Findings of reproducible defects can be reported separately, but a cleanup request does not authorize unrelated behavior fixes. Use code-review when defect or regression review is requested or warranted, not as a compulsory second pass.
