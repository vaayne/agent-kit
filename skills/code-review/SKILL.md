---
name: code-review
description: >
  Multi-perspective code review using adversarial subagent debate.
  First gives the user a simple but detailed What/Why/How/Refs brief: what changed,
  why it exists, how it works, and which files, commits, or PR references support the explanation.
  Then spawns parallel reviewer agents (bug hunter, security auditor, architecture critic, correctness prover)
  that independently analyze the current branch diff, consolidates and debates findings,
  and produces a machine-readable review bundle plus human-readable HTML report with near-zero false positives.
  The report opens with a reviewer-facing overview of the PR — its purpose, what changed and why,
  whether the changes are necessary, and the regression and security risk — before the debated findings.
  Use when the user says "review", "code review", "review my changes", "check this PR",
  "find bugs", "audit this branch", or wants a thorough quality check before merging.
---

# Code Review — Multi-Perspective Adversarial Debate

Review the current branch's changes using parallel subagents with distinct expertise, then consolidate findings through debate into a review bundle: `review.json` for agents, `events.jsonl` for audit history, and rendered `report.html` / `summary.md` for humans.

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
5. Capture the PR's intent for the overview: read the commit messages, the PR description (`gh pr view <number>` when a PR number is given), and any goal the user stated. Note the claimed purpose and whether the diff actually matches it.

### Phase 2: Explain the Change Before Reviewing

Before spawning subagents, explain the PR or branch changes to the user in plain language. This gives the user a shared mental model before the adversarial review starts; do not skip it unless the user explicitly asks for review-only output.

Use this **What/Why/How/Refs brief**:

1. **What**: summarize user-visible behavior, API, CLI, data, config, documentation, and key implementation changes.
2. **Why**: explain the problem, motivation, requirement, or cleanup goal the diff appears to address.
3. **How**: explain the implementation mechanics, entry points, touched modules, control/data flow, important algorithms, state changes, migrations, dependencies, and compatibility choices.
4. **Refs**: cite the concrete files, commits, PR description sections, linked issues, tests, or docs that support the explanation, and call out risky files or areas the reviewers should scrutinize hardest.

Keep it simple enough for a non-author teammate to understand, but do not omit important technical details. Prefer concrete filenames and examples over vague summaries. If intent is unclear from the diff, say what you inferred and what evidence supports it.

### Phase 3: Parallel Independent Review

Spawn **four subagents in parallel** using the Agent tool. Each gets the same diff context but a different review lens. Include the full diff in each prompt (or instruct each agent to run the git commands themselves if the diff is large).

#### Evidence protocol (all agents)

The diff is a claim, not evidence — a hunk hides the five lines above it. Before reporting a finding, every agent must:

1. Read the **full current content** of the changed file, not just the hunks.
2. Trace the callers and callees of any changed symbol it wants to flag (`ast-grep` / `rg`) and confirm the problematic path is actually reachable.
3. Check related tests for the behavior it believes is unverified.

Confidence is operational, not vibes:

- `high` — verified against the actual code; can state a concrete triggering input or sequence.
- `medium` — the logic holds but one link is unconfirmed (e.g. a caller path could not be verified).
- `low` — plausible pattern match, unverified.

Each agent MUST return findings in this exact format — one per finding:

```
### [SEVERITY] Title
- **File**: path/to/file.ext:L42-L50
- **Category**: bug | security | architecture | correctness | performance
- **Description**: What's wrong and why it matters.
- **Evidence**: Concrete trigger — the input, state, or call sequence that provokes the problem, and the code path it takes.
- **Suggestion**: Concrete fix or approach.
- **Confidence**: high | medium | low
```

A finding with no trigger scenario in **Evidence** must be reported at `low` confidence or not at all.

#### Agent 1 — Bug Hunter

Focus: logic errors, off-by-ones, race conditions, null/undefined hazards, error handling gaps, resource leaks, incorrect state transitions. Look for bugs that tests wouldn't catch — the kind that surface in production under edge conditions.

Also owns the `performance` category: accidental O(n²) on hot paths, N+1 queries, unbounded growth of caches or queues, needless sync I/O.

#### Agent 2 — Security Auditor

Focus: injection vectors (SQL, XSS, command), auth/authz gaps, secrets in code, insecure defaults, SSRF, path traversal, unsafe deserialization, cryptographic misuse, OWASP Top 10. Flag anything that widens the attack surface.

#### Agent 3 — Architecture Critic

Before critiquing, map the change's place in the architecture: read the changed files in full, find the callers of every changed interface, and search the repo for existing helpers or conventions the diff duplicates or ignores. Architecture problems live at boundaries the diff doesn't show.

Focus: API design, abstraction depth, coupling, cohesion, separation of concerns, naming, interface complexity, backward compatibility breaks, missing or misplaced error boundaries. Apply the deletion test: if removing this abstraction makes callers simpler, it's a pass-through.

Also check:

- **Codebase consistency** — new helpers or patterns that duplicate something the repo already has, or deviate from its established error-handling, naming, or module-layout conventions. Search first; never flag from the diff alone.
- **Dependency direction** — new imports that cross layers, point the wrong way, or introduce cycles.
- **Change amplification, measured** — if the PR touched many files for one logical change, name the abstraction that leaked.

Additionally, apply _A Philosophy of Software Design_:

- **Deep over shallow** — modules should have simple interfaces with rich internals. Flag pass-throughs and thin wrappers that add indirection without value.
- **Information leakage** — two modules sharing knowledge of each other's internals (shared formats, leaked data structures, temporal coupling). Could one absorb more so the other doesn't need to know?
- **Complexity symptoms** — cognitive load (reader holds too much context), unknown unknowns (non-obvious something important exists).
- **Define errors out of existence** — are errors pushed to callers that the module could handle internally?
- **General-purpose interfaces, specific implementations** — interfaces should be broad enough for future use without over-engineering the implementation.
- **Comments** — flag missing comments that explain _why_ or _how to use_. Don't flag missing comments that restate _what the code does_.

Every architecture finding must include a concrete harm scenario in **Evidence** — "next time someone does X they must also change Y and Z", or "caller A already works around this at file:line". No harm scenario, no finding: that is the line between a design problem and an aesthetic preference.

#### Agent 4 — Correctness Prover

Focus: contract violations, type safety gaps, invariant breaks, concurrency issues, edge cases in algorithms, incorrect assumptions about data shape or ordering, missing validation at system boundaries. Think like a formal verifier — what inputs or sequences would violate the assumptions this code makes?

Also hunt for **missing changes**: callers not updated for a changed contract; config, migrations, or docs that should have changed with the code but didn't. Absence is the bug a diff shows least.

### Phase 4: Consolidation & Debate

After all four agents return:

1. **Deduplicate** — merge findings that describe the same issue from different angles.
2. **Adversarially verify** — do not judge the findings yourself: you consolidated them, which biases you toward them, and you haven't read the code as deeply as the reviewers have. Spawn **fresh verifier subagents in parallel** (batch findings by file or area; verifiers are never the reviewers who reported them). Each verifier gets its findings' claims and evidence and one job: **refute them against the actual code** — is the path reachable, is the triggering input possible, does a caller or an existing check already handle it? Each verifier returns `confirmed | refuted | uncertain` per finding, with code-level evidence for the verdict.
3. **Apply verdicts** — the goal is near-zero false positives; it's better to miss a minor issue than to cry wolf:
   - `confirmed` → keep.
   - `refuted` → record under `dismissed` with the refutation as the reason. Never silently drop.
   - `uncertain` → dismiss, unless severity is critical or high — then keep it, downgrade confidence to `low`, and state the unresolved doubt in the description.

   Cross-agent corroboration is **not** independent evidence — all four reviewers share the same blind spots. Only verifier evidence counts.
4. **Classify severity**:
   - **Critical** — data loss, security vulnerability, crash in production path
   - **High** — incorrect behavior users will hit, silent data corruption
   - **Medium** — edge case bugs, maintainability issues that will cause future bugs
   - **Low** — style, naming, minor improvements
5. **Note pre-existing issues** — if reviewers found bugs in unchanged code adjacent to the diff, list them separately as "Side Quests" (borrowing from the Nolan Lawson approach). These are valuable but shouldn't block the PR.
6. **Compose the PR overview** — a short reviewer-facing orientation written into `review.json.overview`. You now hold both the Phase 1 intent signals and the debated findings, so ground every claim in the diff and those findings; do not speculate. Cover:
   - **purpose** — what problem this PR solves and why it exists (from commit messages, PR description, stated goal).
   - **changes** — what actually changed, grouped by area. Concrete, not a line-by-line restatement of the diff.
   - **rationale** — why it was done this way; the approach and key tradeoffs.
   - **necessity** — your judgment as reviewer: is every change needed? Call out scope creep, speculative additions, or unrelated churn (YAGNI). If it's all warranted, say so plainly.
   - **regression_risk** — `{ level: low | medium | high, notes }`. Blast radius: what existing behavior could break, which paths to retest, gaps in test coverage. Tie medium/high risk to concrete findings where possible.
   - **security** — `{ level: none | low | medium | high, notes }`. New attack surface, trust-boundary/auth changes, secret handling. `none` with a one-line reason is a valid answer.

### Phase 5: Generate Review Bundle

Create a review bundle directory at `~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/`, where `{project}` is the git repo name (if in a git repo) or the basename of the current working directory, `{date}` is `YYYY-MM-DD`, and `{branch-slug}` is the branch name made filesystem-safe by replacing `/` and other non-portable characters with `-`. Keep the original branch name in `review.json.branch`.

Before writing anything, check for an existing bundle:

```bash
bundle=~/.agents/sessions/{project}/reviews/{date}-{branch-slug}
test -e "$bundle/review.json" && echo "existing review bundle: $bundle"
```

If `review.json` already exists, do **not** overwrite it blindly. Read it first and either:

- update it incrementally by fingerprint when reviewing the same branch again;
- only rerender `report.html` / `summary.md` if the review data did not change;
- or create a new bundle with a unique suffix such as `{date}-{branch-slug}-{short-sha}` when the user explicitly wants a fresh independent run.

Never use a direct write over an existing `review.json` without preserving prior finding IDs, statuses, resolutions, `dismissed` entries, and `events.jsonl` history.

Write these files:

- `review.json` — canonical machine-readable current-state snapshot for agents and scripts, including the Phase 4 `overview` and `dismissed` entries.
- `events.jsonl` — append-only audit log for review creation, finding additions, status changes, and report renders.
- `report.html` — human-readable report rendered from `review.json`.
- `summary.md` — compact Markdown summary rendered from `review.json` for chat, PR comments, and handoff.

Follow [references/review-schema.md](references/review-schema.md) for the exact JSON shape. Do not read or hand-edit `report-template.html` during normal reviews; it is a static asset used by the renderer.

After writing `review.json`, initialize `events.jsonl` with `review.created`, one `finding.added` event per finding, and one `finding.dismissed` event per dismissed entry, then render the human-facing files:

```bash
node scripts/render-review.mjs \
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
   node scripts/update-review.mjs \
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

0. Check each new finding against `dismissed` first — match by fingerprint, but also semantically, since rerun reviewers rephrase the same non-issue. On a match, drop it again without re-verification, unless it carries new evidence that contradicts the recorded dismissal reason — then re-verify before admitting it.
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

## Localization

Write the review report in the same language the user is using. If the user writes in Chinese, all human-facing text — the overview (purpose, changes, rationale, necessity, and risk notes), assessment, verdict explanation, finding descriptions, evidence, suggestions, impact statements, and dismissal reasons — must be in Chinese. Finding IDs (`CR-001`), field names, file paths, code snippets, and severity labels (`critical`, `high`, `medium`, `low`) stay in English since they are machine-readable keys.

## Edge Cases

- **Large diffs (>500 lines)**: Split the diff by file or directory and have each agent review in batches. Summarize cross-file concerns separately.
- **No findings**: Write a valid review bundle with an empty `findings` array and a ship-it verdict. "No findings" is valid — don't manufacture issues to fill the report.
- **User provides a PR number**: Use `gh pr diff <number>` and `gh pr view <number>` for additional context (title, description, linked issues).
