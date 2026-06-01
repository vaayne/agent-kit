---
name: code-review
description: >
  Multi-perspective code review using adversarial subagent debate.
  Spawns parallel reviewer agents (bug hunter, security auditor, architecture critic, correctness prover)
  that independently analyze the current branch diff, then consolidates and debates findings
  to produce a machine-readable review bundle plus human-readable HTML report with near-zero false positives.
  Use when the user says "review", "code review", "review my changes", "check this PR",
  "find bugs", "audit this branch", or wants a thorough quality check before merging.
---

# Code Review — Multi-Perspective Adversarial Debate

Review the current branch's changes using parallel subagents with distinct expertise, then consolidate findings through debate into a review bundle: `review.json` for agents, `events.jsonl` for audit history, and rendered `report.html` / `summary.md` for humans.

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

### Phase 4: Generate Review Bundle

Create a review bundle directory at `~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/`, where `{project}` is the git repo name (if in a git repo) or the basename of the current working directory, `{date}` is `YYYY-MM-DD`, and `{branch-slug}` is the branch name made filesystem-safe by replacing `/` and other non-portable characters with `-`. Keep the original branch name in `review.json.branch`.

Write these files:

- `review.json` — canonical machine-readable current-state snapshot for agents and scripts.
- `events.jsonl` — append-only audit log for review creation, finding additions, status changes, and report renders.
- `report.html` — human-readable report rendered from `review.json`.
- `summary.md` — compact Markdown summary rendered from `review.json` for chat, PR comments, and handoff.

Follow [references/review-schema.md](references/review-schema.md) for the exact JSON shape. Do not read or hand-edit `report-template.html` during normal reviews; it is a static asset used by the renderer.

After writing `review.json`, initialize `events.jsonl` with `review.created` and one `finding.added` event per finding, then render the human-facing files:

```bash
node skills/code-review/references/render-review.mjs \
  ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/review.json \
  ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/
```

Open the HTML report in the browser after generating it:

```bash
open ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/report.html  # macOS
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

## Follow-up Fix Workflow

When the user asks to fix issues from a previous review:

1. Locate the latest review bundle under `~/.agents/sessions/{project}/reviews/*/` unless the user gives a specific path.
2. Read `review.json`, not `report.html`.
3. Select findings whose `status` is `open` or `reopened`.
4. Fix issues in severity order: critical, high, medium, low.
5. After each completed fix, update the finding through `update-review.mjs` so the snapshot, event log, HTML report, and summary stay in sync:
   ```bash
   node skills/code-review/references/update-review.mjs \
     ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/review.json \
     fixed CR-001 \
     --commit <sha> \
     --note "Added validation and regression test."
   ```
6. If a finding is invalid, mark it `false-positive` with a note instead of deleting it.
7. If the team accepts the risk, mark it `accepted-risk` with a note.

## Incremental Review Merge Rules

When rerunning review for the same branch, update the existing review bundle instead of replacing it.

Merge findings by `fingerprint`:

1. If a new finding matches an existing fingerprint:
   - Keep the existing `id`.
   - Update location, description, severity, confidence, and reviewers.
   - If the existing status is `fixed` but the issue still appears, set status to `reopened` and append `finding.reopened`.
2. If a new finding has no match:
   - Assign the next ID, e.g. `CR-002`.
   - Set status to `open`.
   - Append `finding.added`.
3. If an existing open finding no longer appears:
   - Set status to `stale` or leave it open with a verification note if unsure.
   - Append `finding.stale` when marking stale.
4. Do not delete old findings during normal updates. Preserve review history through statuses and `events.jsonl`.

## Edge Cases

- **Large diffs (>500 lines)**: Split the diff by file or directory and have each agent review in batches. Summarize cross-file concerns separately.
- **No findings**: Write a valid review bundle with an empty `findings` array and a ship-it verdict. "No findings" is valid — don't manufacture issues to fill the report.
- **User provides a PR number**: Use `gh pr diff <number>` and `gh pr view <number>` for additional context (title, description, linked issues).
