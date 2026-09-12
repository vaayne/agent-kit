---
name: code-review
description: Review code changes for reproducible defects and regression risks. Use when reviewing a diff, branch, pull request, or uncommitted changes.
---

# Code Review

Two modes, chosen by request and risk:

- **Normal review (default)** — you read the changes and the touched files yourself and report evidence-backed findings in chat. No subagents, no report files.
- **Deep review** — parallel reviewer agents, adversarial verification, and a persistent review bundle (`review.json`, `events.jsonl`, `report.html`, `summary.md`). Run it only when the user explicitly asks for a thorough or deep review, or the diff carries substantive cross-module, security, or concurrency risk. Full process: [references/deep-review.md](references/deep-review.md).

Use normal review unless the request or a concrete risk warrants deeper review. The evidence protocol applies in both modes.

## Gather context

1. Determine the review scope from the user's request:
   - Branch or PR changes — find the base branch (default `main` or `master`), then:
     ```bash
     git log --oneline $(git merge-base HEAD <base>)..HEAD
     git diff $(git merge-base HEAD <base>)..HEAD
     ```
     For a PR number, use `gh pr diff <number>` and `gh pr view <number>` for the diff, title, description, and linked issues.
   - Uncommitted changes — `git status`, then `git diff` for unstaged and `git diff --cached` for staged changes. Read in-scope untracked files from `git status` too; neither diff includes them.
   - An explicit commit range, ref, or file list from the user — use it as given.
2. If the scope is empty, confirm you checked the right scope first, then stop and say there is nothing to review.
3. Capture intent: commit messages, PR description, the user's stated goal. Note the claimed purpose and whether the changes actually match it.

## Normal review

1. Apply the evidence protocol below to everything in scope and report findings ordered by severity in the finding format. "No findings" is a valid result — don't manufacture issues.
2. Unless the user asked for findings only, first briefly explain what changed and why — a few sentences per area, enough for a shared mental model. If intent is unclear, say what you inferred and on what evidence.
3. List pre-existing bugs found in unchanged code adjacent to the changes separately as side quests — valuable, but they don't block the work.
4. Write in the user's language. Do not create a review bundle or report files unless the user asks for one; if they do, read only the Review bundle and Report details sections of [references/deep-review.md](references/deep-review.md). A report request alone does not require reviewer agents.

## Evidence protocol

The diff is a claim, not evidence — a hunk hides the five lines above it. Before reporting a finding:

1. Read the **current content** of the changed file, not just the hunks — the whole file when reasonable; for large files, the changed regions plus enough context to verify the claim. Check the revision the diff actually targets (working tree for uncommitted changes, branch tip for a PR).
2. Trace the callers and callees of any changed symbol being flagged (`rg` / `ast-grep`) and confirm the problematic path is actually reachable.
3. Check related tests for the behavior believed unverified.

Confidence is operational, not vibes:

- `high` — verified against the actual code; a concrete triggering input or sequence can be stated.
- `medium` — the defect and reachable path are established, but its frequency or full impact is uncertain.
- `low` — unverified suspicion; report it as an unresolved doubt, not a confirmed finding.

Report each finding in this format:

    ### [SEVERITY] Title
    - **File**: path/to/file.ext:L42-L50
    - **Category**: bug | security | architecture | correctness | performance
    - **Description**: What's wrong and why it matters.
    - **Evidence**: Concrete trigger — the input, state, or call sequence that provokes the problem, and the code path it takes.
    - **Suggestion**: Concrete fix or approach.
    - **Confidence**: high | medium | low

A claim without an established trigger belongs in unresolved doubts when the missing evidence is actionable; otherwise omit the speculation. Architecture findings need a concrete harm scenario ("next time someone does X they must also change Y", or "caller A already works around this at file:line"), not an aesthetic preference.

Severity:

- **Critical** — data loss, security vulnerability, crash in production path
- **High** — incorrect behavior users will hit, silent data corruption
- **Medium** — edge case bugs, maintainability issues that will cause future bugs
- **Low** — minor defects with limited blast radius

Pure style or naming cleanup is `refine-code` territory — at most a side note, not a finding. And no findings is not proof of adequate verification: if parts of the scope went unchecked, say so, and report suspected issues you could neither confirm nor refute as unresolved doubts rather than findings or silence.

## References and scripts

Paths below are relative to this skill's directory (the folder containing this SKILL.md).

- [references/deep-review.md](references/deep-review.md) — deep review process: reviewer lenses, verifier debate, review bundle generation, incremental reruns, follow-up fix workflow.
- [references/review-schema.md](references/review-schema.md) — `review.json` shape. Read when generating or updating a bundle.
- `scripts/render-review.mjs` — render `report.html` and `summary.md` from `review.json`.
- `scripts/update-review.mjs` — update a finding's status inside an existing bundle.
