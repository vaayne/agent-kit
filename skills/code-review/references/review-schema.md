# Review Bundle Schema

The review bundle serves both humans and agents. `review.json` is the canonical machine-readable snapshot. `report.html` and `summary.md` are rendered views.

## Files

```text
~/.agents/sessions/{project}/reviews/{date}-{branch-name}/
  review.json       # mutable current-state snapshot
  events.jsonl      # append-only audit log
  report.html       # human-readable HTML rendered from review.json
  summary.md        # compact Markdown summary rendered from review.json
```

Do not treat `report.html` as source data. Agents fixing issues should read `review.json`.

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
  "assessment": "One-sentence summary of the review outcome.",
  "stats": {
    "commits": 3,
    "files_changed": 8,
    "lines_added": 120,
    "lines_removed": 34
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
      "impact": "Users can save config that fails at runtime.",
      "suggestion": "Reject empty provider names during parseConfig.",
      "fix_hint": {
        "kind": "edit",
        "target": "src/config.ts",
        "summary": "Add non-empty validation before returning parsed config."
      }
    }
  ],
  "side_quests": []
}
```

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
- `confidence`: `high | medium | low`
- `reviewers`
- `description`
- `suggestion`

Optional but useful:

- `impact`
- `fix_hint`
- `resolution`
- `code_anchor`

## Fingerprints

Use a stable root-cause key, not a line number:

```text
{category}|{normalized-file}|{stable-title-slug}|{root-cause-key}
```

Example:

```text
correctness|src/config.ts|empty-provider-name|parse-config-validation
```

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
{"ts":"2026-06-01T12:30:00.000Z","type":"finding.fixed","finding_id":"CR-001","commit":"def5678","note":"Added validation and regression test."}
```
