# Deep Review

The heavy path: parallel reviewer agents, adversarial verification, and a persistent review bundle. Read this file only when running a deep review or when generating, updating, or fixing from a review bundle. The evidence protocol, finding format, and severity definitions live in `../SKILL.md` and apply here unchanged.

Paths like `scripts/...` and `references/...` are relative to the skill root — the directory containing `SKILL.md`.

## Contents

- [Explain the change](#explain-the-change)
- [Parallel review](#parallel-review)
- [Consolidation and debate](#consolidation-and-debate)
- [Review bundle](#review-bundle)
- [Follow-up fix workflow](#follow-up-fix-workflow)
- [Incremental reruns](#incremental-reruns)
- [Report details](#report-details)
- [Edge cases](#edge-cases)

## Explain the change

Before spawning reviewers, explain the changes to the user in plain language — a shared mental model before the adversarial review starts. Skip only when the user explicitly asks for review-only output.

Use this **What/Why/How/Refs brief**:

1. **What** — user-visible behavior, API, CLI, data, config, documentation, and key implementation changes.
2. **Why** — the problem, motivation, requirement, or cleanup goal the diff appears to address.
3. **How** — implementation mechanics, entry points, touched modules, control/data flow, important algorithms, state changes, migrations, dependencies, and compatibility choices.
4. **Refs** — the concrete files, commits, PR description sections, linked issues, tests, or docs that support the explanation, and the risky files or areas reviewers should scrutinize hardest.

Keep it simple enough for a non-author teammate to understand without omitting important technical detail. Prefer concrete filenames and examples over vague summaries.

## Parallel review

Spawn reviewer agents in parallel with the host's subagent mechanism — in bb, `bb thread spawn` child threads (never native agent tools); in other hosts, the native subagent tool. Each reviewer gets the same diff context — the full diff in its prompt, or instructions to run the git commands itself when the diff is large — plus the evidence protocol and finding format from `../SKILL.md`.

Choose lenses that fit the diff. A good default set:

- **Bug hunter** — logic errors, off-by-ones, race conditions, null/undefined hazards, error handling gaps, resource leaks, incorrect state transitions; bugs that tests wouldn't catch. Also owns `performance`: accidental O(n²) on hot paths, N+1 queries, unbounded cache or queue growth, needless sync I/O.
- **Security auditor** — injection vectors (SQL, XSS, command), auth/authz gaps, secrets in code, insecure defaults, SSRF, path traversal, unsafe deserialization, cryptographic misuse, OWASP Top 10; anything that widens the attack surface.
- **Architecture critic** — maps the change's place in the architecture first: read changed files in full, find callers of every changed interface, search the repo for existing helpers or conventions the diff duplicates or ignores. Then API design, abstraction depth, coupling, cohesion, naming, backward compatibility, error boundaries; codebase consistency; dependency direction (crossed layers, cycles); measured change amplification. Apply _A Philosophy of Software Design_: deep over shallow modules, information leakage, complexity symptoms, defining errors out of existence, general-purpose interfaces with specific implementations, comments that explain why over what. The deletion test: if removing an abstraction makes callers simpler, it's a pass-through.
- **Correctness prover** — contract violations, type safety gaps, invariant breaks, concurrency issues, edge cases in algorithms, wrong assumptions about data shape or ordering, missing validation at boundaries. Also hunts **missing changes**: callers not updated for a changed contract; config, migrations, or docs that should have changed but didn't. Absence is the bug a diff shows least.

Four lenses is a starting point, not a quota — one agent may cover several lenses on a small diff, and a large or risky diff may warrant more agents or split batches.

## Consolidation and debate

After the reviewers return:

1. **Deduplicate** — merge findings that describe the same issue from different angles.
2. **Adversarially verify** — do not judge the findings yourself: you consolidated them, which biases you toward them, and you haven't read the code as deeply as the reviewers. Spawn fresh verifier agents in parallel (batch findings by file or area; verifiers are never the reviewers who reported them). Each verifier gets its findings' claims and evidence and one job: **refute them against the actual code** — is the path reachable, is the triggering input possible, does a caller or an existing check already handle it? Each verifier returns `confirmed | refuted | uncertain` per finding, with code-level evidence.
3. **Apply verdicts** — the goal is near-zero false positives; better to miss a minor issue than cry wolf:
   - `confirmed` → keep.
   - `refuted` → record under `dismissed` with the refutation as the reason. Never silently drop.
   - `uncertain` → dismiss, unless severity is critical or high — then keep it, downgrade confidence to `low`, and state the unresolved doubt in the description.

   Cross-agent corroboration is **not** independent evidence — reviewers share the same blind spots. Only verifier evidence counts.
4. **Side quests** — pre-existing bugs in unchanged code adjacent to the diff get listed separately; valuable, but they don't block the PR.
5. **Compose the PR overview** — a short reviewer-facing orientation written into `review.json.overview`, grounded in the diff and the debated findings; do not speculate. Cover:
   - `purpose` — what problem this PR solves and why it exists.
   - `changes` — what actually changed, grouped by area. Concrete, not a line-by-line diff restatement.
   - `rationale` — why it was done this way; approach and key tradeoffs.
   - `necessity` — reviewer judgment: is every change needed? Call out scope creep, speculative additions, unrelated churn (YAGNI); if all warranted, say so plainly.
   - `regression_risk` — `{ level: low | medium | high, notes }`. Blast radius: what existing behavior could break, which paths to retest, coverage gaps. Tie medium/high to concrete findings where possible.
   - `security` — `{ level: none | low | medium | high, notes }`. New attack surface, trust-boundary/auth changes, secret handling. `none` with a one-line reason is valid.

## Review bundle

Create a bundle directory at `~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/`, where `{project}` is the git repo name (or the basename of the working directory outside a repo), `{date}` is `YYYY-MM-DD`, and `{branch-slug}` is the branch name made filesystem-safe by replacing `/` and other non-portable characters with `-`. Keep the original branch name in `review.json.branch`.

Before writing anything, check for an existing bundle:

```bash
bundle=~/.agents/sessions/{project}/reviews/{date}-{branch-slug}
test -e "$bundle/review.json" && echo "existing review bundle: $bundle"
```

If `review.json` already exists, do **not** overwrite it blindly. Read it first and either:

- update it incrementally by fingerprint when reviewing the same branch again (see [Incremental reruns](#incremental-reruns));
- only rerender `report.html` / `summary.md` if the review data did not change;
- or create a new bundle with a unique suffix such as `{date}-{branch-slug}-{short-sha}` when the user explicitly wants a fresh independent run.

Never use a direct write over an existing `review.json` without preserving prior finding IDs, statuses, resolutions, `dismissed` entries, and `events.jsonl` history.

Write these files:

- `review.json` — canonical machine-readable current-state snapshot, including `overview` and `dismissed` entries.
- `events.jsonl` — append-only audit log for review creation, finding additions, status changes, and report renders.
- `report.html` — human-readable report rendered from `review.json`.
- `summary.md` — compact Markdown summary rendered from `review.json` for chat, PR comments, and handoff.

Follow [references/review-schema.md](review-schema.md) for the exact JSON shape. Do not read or hand-edit `report-template.html`; it is a static asset used by the renderer.

After writing `review.json`, initialize `events.jsonl` with `review.created`, one `finding.added` event per finding, and one `finding.dismissed` event per dismissed entry, then render the human-facing files (script paths relative to the skill root):

```bash
node scripts/render-review.mjs \
  ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/review.json \
  ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/
```

Open the HTML report after generating it:

```bash
open ~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/report.html  # macOS
```

## Follow-up fix workflow

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

## Incremental reruns

When rerunning review for the same branch, update the existing bundle instead of replacing it. Merge findings by `fingerprint`:

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
   - Set status to `stale`, or leave it open with a verification note if unsure.
   - Append `finding.stale` when marking stale.
4. Do not delete old findings during normal updates. Preserve review history through statuses and `events.jsonl`.

## Report details

Severity-based action guidance for the report footer:

| Severity | Action                                                                               |
| -------- | ------------------------------------------------------------------------------------ |
| Critical | Must fix before merge. Consider abandoning the approach if multiple criticals exist. |
| High     | Should fix before merge.                                                             |
| Medium   | Fix if effort is low, otherwise track as follow-up.                                  |
| Low      | Optional. Address during future cleanup.                                             |

Localization: write the report in the user's language. All human-facing text — the overview (purpose, changes, rationale, necessity, risk notes), assessment, verdict explanation, finding descriptions, evidence, suggestions, impact statements, and dismissal reasons — follows the user's language. Finding IDs (`CR-001`), field names, file paths, code snippets, and severity labels (`critical`, `high`, `medium`, `low`) stay in English as machine-readable keys.

## Edge cases

- **Large diffs (>500 lines)** — split the diff by file or directory and have each reviewer work in batches. Summarize cross-file concerns separately.
- **No findings** — write a valid bundle with an empty `findings` array and a ship-it verdict. Don't manufacture issues to fill the report.
