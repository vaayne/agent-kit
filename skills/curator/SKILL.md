---
name: curator
description: >
  Maintain the nmem knowledge base — a lint pass that hunts contradictions,
  duplicates, dead references, and expired entries, plus a synthesis pass that
  reports what changed and what is drifting. Use when the user says "lint my
  memory", "curate", "整理知识库", "nmem 维护", suspects memories have gone
  stale, or on a scheduled maintenance run.
---

# Curator

Harvest writes; curator keeps it trustworthy. An unmaintained knowledge base rots — contradictions accumulate, duplicates fragment retrieval, and references outlive the things they point to. Two passes, run together or alone.

## Lint pass

Routine-tier work: mechanical checks, conservative fixes.

1. **Scope the window.** Find the last curator-run memory (`nmem memories search "curator run"`); lint what changed since. First run: sweep everything (`nmem memories list`, `nmem stats`).
2. **Duplicates** — search topic clusters the window touched; near-identical entries merge into the strongest one (`update`), losers get `supersede` links.
3. **Contradictions** — where a newer memory disagrees with an older one, verify which is true now; `deprecate` the loser with the reason recorded, never silently.
4. **Dead references** — memories naming files, flags, skills, or commands: verify each still exists (check the repo or filesystem). Update what moved; deprecate what vanished.
5. **Expired** — entries whose stated expiry has passed: re-verify or deprecate. Time-sensitive claims with no expiry get one added now.

Fix verbs, in order of preference: `update` (correct in place) → `supersede` (old links to replacement) → `deprecate` (obsolete, kept for audit) → `delete` (only for entries wrong from birth). History stays legible.

## Synthesis pass

Premium-tier work: judgment across the whole window.

Read the window's memories plus the feed (`nmem feed`), then write a short report to the user: what entered, what themes are forming, what drifts from earlier decisions, what deserves attention next. This is the pass that surfaces cross-source connections no single entry shows.

## Closing a run

End every run by saving one memory: `curator run <date> — <n> linted, <fixes>, <one-line synthesis>`. That entry is the next run's starting line.

Run manually until the output proves itself; then schedule it (weekly is the right default) via the runtime's scheduler.
