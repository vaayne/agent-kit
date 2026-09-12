# Review Bundle Schema

The review bundle serves both humans and agents. `review.json` is the canonical machine-readable snapshot. `report.html` and `summary.md` are rendered views.

## Files

```text
~/.agents/sessions/{project}/reviews/{date}-{branch-slug}/
  review.json       # mutable current-state snapshot
  events.jsonl      # append-only audit log
  report.html       # human-readable HTML rendered from review.json
  summary.md        # compact Markdown summary rendered from review.json
```

Do not treat `report.html` as source data. Agents fixing issues should read `review.json`.

`{branch-slug}` is a filesystem-safe branch name with `/` and other non-portable characters replaced by `-`. Keep the original branch name in `review.json.branch`.

If a bundle already contains `review.json`, preserve it. Merge reruns by finding fingerprint, keep existing IDs/statuses/resolutions, append events to `events.jsonl`, and rerender derived files. Create a new suffixed bundle only when a fresh independent run is explicitly wanted.

## `review.json`

```json
{
  "schema_version": 1,
  "review_id": "2026-06-01-feature-auth",
  "project": "agent-kit",
  "branch": "feature/auth",
  "base": "main",
  "head_sha": "abc1234",
  "generated_at": "2026-06-01T12:00:00.000Z",
  "updated_at": "2026-06-01T12:00:00.000Z",
  "verdict": "fix-and-ship",
  "assessment": "Human-written summary; preserved by tooling.",
  "auto_assessment": "Computed summary refreshed by update-review.mjs.",
  "verification": {
    "complete": false,
    "limitations": ["Payment webhook path could not be exercised locally."]
  },
  "unresolved": [
    {
      "fingerprint": "correctness|src/queue.ts|double-enqueue|retry-path",
      "category": "correctness",
      "file": "src/queue.ts",
      "severity": "high",
      "title": "Possible double enqueue on retry",
      "reason": "Retry path could not be traced end to end; neither confirmed nor refuted.",
      "recorded_at": "2026-06-01T12:00:00.000Z"
    }
  ],
  "stats": {
    "commits": 3,
    "files_changed": 8,
    "lines_added": 120,
    "lines_removed": 34
  },
  "overview": {
    "purpose": "What problem this PR solves and why it exists.",
    "changes": "What actually changed, grouped by area.",
    "rationale": "Why it was done this way; approach and key tradeoffs.",
    "necessity": "Reviewer judgment: are the changes necessary? Scope-creep callouts, or all-warranted.",
    "regression_risk": {
      "level": "low",
      "notes": "Blast radius, paths to retest, coverage gaps."
    },
    "security": {
      "level": "none",
      "notes": "New attack surface, auth/secret changes, or none."
    }
  },
  "findings": [
    {
      "id": "CR-001",
      "fingerprint": "correctness|src/config.ts|empty-provider-name|parse-config-validation",
      "severity": "high",
      "category": "correctness",
      "title": "Empty provider name is accepted",
      "file": "src/config.ts",
      "line_start": 42,
      "line_end": 58,
      "status": "open",
      "introduced_by_diff": true,
      "confidence": "high",
      "reviewers": ["bug-hunter", "correctness-prover"],
      "description": "The parser accepts an empty provider name.",
      "evidence": "parseConfig (src/config.ts:42) returns without checking name.length; callers in src/cli.ts:118 pass user input through unvalidated.",
      "impact": "Users can save config that fails at runtime.",
      "suggestion": "Reject empty provider names during parseConfig.",
      "fix_hint": {
        "kind": "edit",
        "target": "src/config.ts",
        "summary": "Add non-empty validation before returning parsed config."
      }
    }
  ],
  "side_quests": [],
  "dismissed": [
    {
      "fingerprint": "bug|src/cache.ts|stale-read|ttl-check",
      "category": "bug",
      "file": "src/cache.ts",
      "title": "Stale read after TTL expiry",
      "reason": "Refuted: get() revalidates TTL at src/cache.ts:88 before returning.",
      "dismissed_at": "2026-06-01T12:00:00.000Z"
    }
  ]
}
```

## `overview`

A reviewer-facing orientation written by the main agent during consolidation, rendered above the findings. Expected for new reviews; preserved across reruns. All prose is localized to the user's language.

- `purpose` — what problem this PR solves and why it exists
- `changes` — what actually changed, grouped by area (not a line-by-line diff restatement)
- `rationale` — why it was done this way; approach and key tradeoffs
- `necessity` — reviewer judgment on whether the changes are needed; scope-creep / YAGNI callouts
- `regression_risk` — `{ level: low | medium | high, notes }`
- `security` — `{ level: none | low | medium | high, notes }`

Ground every claim in the diff and findings. Tie medium/high risk to concrete findings where possible.

## `verification`

`{ complete: boolean, limitations: string[] }` records whether the checks this review scope needs have all run. `complete` is `true` only when every necessary check for the reviewed scope was done. `limitations` describes non-blocking scope limits — what was out of scope or only partially exercised; blocking doubts belong in `unresolved`, not here. Older bundles without this field must not default to a pass — renderers and tools treat missing verification as `needs-review`. Status updates via `update-review.mjs` never touch `verification`: marking a finding fixed cannot turn an incomplete verification into a pass.

## `unresolved`

Claims that survived verification without a verdict — neither confirmed nor refuted. Stored separately from `findings` (confirmed) and `dismissed` (refuted): `fingerprint`, `category`, `file`, optional `severity`, `title`, `reason` (the open doubt), optional `evidence`, `recorded_at`. Never silently dropped. On rerun, match new doubts against `unresolved` semantically like `dismissed`; a settled doubt becomes a finding or a `dismissed` entry.

## `verdict`

`ship-it | fix-and-ship | rethink | needs-review`. `ship-it` requires `verification.complete === true`, zero open findings, and zero `unresolved` entries — no findings alone is not proof the review was thorough. A stored `ship-it` never outranks open findings, unresolved doubts, or missing verification; tools recompute against current data. Other stored verdicts are the reviewer's call and stay as recorded, including during finding updates; revisit them explicitly after their rationale is resolved. Findings marked `accepted-risk` do not count as open, but accepting risk still requires the relevant authorization.

## Finding requirements

Every finding must include:

- `id`: stable review-local ID, e.g. `CR-001`
- `fingerprint`: stable merge key; do not use line numbers alone
- `severity`: `critical | high | medium | low`
- `category`: `bug | security | architecture | correctness | performance`
- `title`
- `file`
- `line_start`
- `line_end`
- `status`: `open | fixed | reopened | accepted-risk | false-positive | stale`
- `confidence`: `high | medium | low` — operational, not vibes: `high` = verified against the actual code with a concrete trigger; `medium` = defect and reachable path established but frequency or full impact uncertain; `low` = legacy/unverified claim, use `unresolved` for new unverified claims
- `reviewers`
- `description`
- `evidence`: concrete trigger — the input, state, or call sequence that provokes the problem, and the code path it takes
- `suggestion`

Optional but useful:

- `impact`
- `fix_hint`
- `resolution`
- `code_anchor`
- `introduced_by_diff`

## Fingerprints

Use a stable root-cause key, not a line number:

```text
{category}|{normalized-file}|{stable-title-slug}|{root-cause-key}
```

Example:

```text
correctness|src/config.ts|empty-provider-name|parse-config-validation
```

## `dismissed`

Findings refuted during adversarial verification. Recorded so reruns don't re-litigate them: reviewers rediscover the same non-issues every run, and without this list each rerun re-verifies them from scratch.

Each entry: `fingerprint`, `category`, `file`, `title`, `reason` (the refutation, with code evidence), `dismissed_at`.

On rerun, match new findings against `dismissed` by fingerprint and semantically. Matches are dropped again without re-verification unless they carry new evidence contradicting the recorded reason. Append a `finding.dismissed` event when adding entries; never delete entries during normal updates.

## Status transitions

```text
open -> fixed | accepted-risk | false-positive | stale
fixed -> reopened
stale -> open | fixed
reopened -> fixed | accepted-risk | false-positive
```

Do not delete findings during normal updates. Preserve history through status and `events.jsonl`.

## `events.jsonl`

Append one JSON object per line:

```jsonl
{"ts":"2026-06-01T12:00:00.000Z","type":"review.created","review_id":"2026-06-01-feature-auth","head_sha":"abc1234"}
{"ts":"2026-06-01T12:00:01.000Z","type":"finding.added","finding_id":"CR-001","fingerprint":"correctness|src/config.ts|empty-provider-name|parse-config-validation"}
{"ts":"2026-06-01T12:00:02.000Z","type":"finding.dismissed","fingerprint":"bug|src/cache.ts|stale-read|ttl-check","reason":"get() revalidates TTL at src/cache.ts:88 before returning."}
{"ts":"2026-06-01T12:30:00.000Z","type":"finding.fixed","finding_id":"CR-001","commit":"def5678","note":"Added validation and regression test."}
```
