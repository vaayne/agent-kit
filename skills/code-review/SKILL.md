---
name: code-review
description: >
  Multi-perspective code review using adversarial subagent debate.
  Spawns parallel reviewer agents (bug hunter, security auditor, architecture critic, correctness prover)
  that independently analyze the current branch diff, then consolidates and debates findings
  to produce a severity-ranked HTML report with near-zero false positives.
  Use when the user says "review", "code review", "review my changes", "check this PR",
  "find bugs", "audit this branch", or wants a thorough quality check before merging.
---

# Code Review — Multi-Perspective Adversarial Debate

Review the current branch's changes using parallel subagents with distinct expertise, then consolidate findings through debate into a single HTML report.

## Why this works

Single-model reviews catch ~50% of real bugs. Multi-model adversarial debate pushes detection to ~80%, with the hardest system-level bugs reaching 100% detection. Independent perspectives reduce false positives to near zero — a finding that survives cross-examination is almost certainly real.

---

## Process

### Phase 1: Gather Context

1. Determine the base branch (default: `main` or `master`).
   If the user provides a PR number, use `gh pr diff <number>` instead.
2. Run:
   ```bash
   git log --oneline $(git merge-base HEAD <base>)..HEAD
   git diff $(git merge-base HEAD <base>)..HEAD
   ```
3. If the diff is empty, stop and tell the user there are no changes to review.
4. Identify the languages, frameworks, and key files touched.

### Phase 2: Parallel Independent Review

Spawn **four subagents in parallel** using the Agent tool. Each gets the same diff context but a different review lens. Include the full diff in each prompt (or instruct each agent to run the git commands themselves if the diff is large).

Each agent MUST return findings in this exact format — one per finding:

```
### [SEVERITY] Title
- **File**: path/to/file.ext:L42-L50
- **Category**: bug | security | architecture | correctness | performance
- **Description**: What's wrong and why it matters.
- **Suggestion**: Concrete fix or approach.
- **Confidence**: high | medium | low
```

#### Agent 1 — Bug Hunter

Focus: logic errors, off-by-ones, race conditions, null/undefined hazards, error handling gaps, resource leaks, incorrect state transitions. Look for bugs that tests wouldn't catch — the kind that surface in production under edge conditions.

#### Agent 2 — Security Auditor

Focus: injection vectors (SQL, XSS, command), auth/authz gaps, secrets in code, insecure defaults, SSRF, path traversal, unsafe deserialization, cryptographic misuse, OWASP Top 10. Flag anything that widens the attack surface.

#### Agent 3 — Architecture Critic

Focus: API design, abstraction depth, coupling, cohesion, separation of concerns, naming, interface complexity, backward compatibility breaks, missing or misplaced error boundaries. Apply the deletion test: if removing this abstraction makes callers simpler, it's a pass-through.

Additionally, apply _A Philosophy of Software Design_:

- **Deep over shallow** — modules should have simple interfaces with rich internals. Flag pass-throughs and thin wrappers that add indirection without value.
- **Information leakage** — two modules sharing knowledge of each other's internals (shared formats, leaked data structures, temporal coupling). Could one absorb more so the other doesn't need to know?
- **Complexity symptoms** — change amplification (one change touches many places), cognitive load (reader holds too much context), unknown unknowns (non-obvious something important exists).
- **Define errors out of existence** — are errors pushed to callers that the module could handle internally?
- **General-purpose interfaces, specific implementations** — interfaces should be broad enough for future use without over-engineering the implementation.
- **Comments** — flag missing comments that explain _why_ or _how to use_. Don't flag missing comments that restate _what the code does_.

#### Agent 4 — Correctness Prover

Focus: contract violations, type safety gaps, invariant breaks, concurrency issues, edge cases in algorithms, incorrect assumptions about data shape or ordering, missing validation at system boundaries. Think like a formal verifier — what inputs or sequences would violate the assumptions this code makes?

### Phase 3: Consolidation & Debate

After all four agents return:

1. **Deduplicate** — merge findings that describe the same issue from different angles.
2. **Cross-examine** — for each finding, consider the perspectives of the other agents:
   - Would the bug hunter's finding survive the correctness prover's scrutiny?
   - Does the security auditor's concern apply given the architecture critic's understanding of the boundaries?
   - Is the architecture critic's suggestion actually motivated by a real problem, or is it aesthetic?
3. **Classify severity**:
   - **Critical** — data loss, security vulnerability, crash in production path
   - **High** — incorrect behavior users will hit, silent data corruption
   - **Medium** — edge case bugs, maintainability issues that will cause future bugs
   - **Low** — style, naming, minor improvements
4. **Eliminate weak findings** — drop anything with low confidence that no other agent corroborated. The goal is near-zero false positives; it's better to miss a minor issue than to cry wolf.
5. **Note pre-existing issues** — if reviewers found bugs in unchanged code adjacent to the diff, list them separately as "Side Quests" (borrowing from the Nolan Lawson approach). These are valuable but shouldn't block the PR.

### Phase 4: Generate HTML Report

Use the `html-artifact` skill patterns or write a standalone HTML file. Save it to `~/.agents/sessions/{project}/reviews/{date}-{branch-name}.html` where `{project}` is the git repo name (if in a git repo) or the basename of the current working directory, and `{date}` is `YYYY-MM-DD`.

Follow the template in [references/report-template.md](references/report-template.md).

Open the report in the browser after generating it:

```bash
open ~/.agents/sessions/{project}/reviews/{date}-{branch-name}.html  # macOS
```

---

## Severity-Based Action Guidance

Include this in the report footer:

| Severity | Action                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| Critical | Must fix before merge. Consider abandoning the approach if multiple criticals exist. |
| High     | Should fix before merge.                                                             |
| Medium   | Fix if effort is low, otherwise track as follow-up.                                  |
| Low      | Optional. Address during future cleanup.                                             |

---

## Edge Cases

- **Large diffs (>500 lines)**: Split the diff by file or directory and have each agent review in batches. Summarize cross-file concerns separately.
- **No findings**: Report a clean bill of health. "No findings" is a valid and useful result — don't manufacture issues to fill the report.
- **User provides a PR number**: Use `gh pr diff <number>` and `gh pr view <number>` for additional context (title, description, linked issues).
