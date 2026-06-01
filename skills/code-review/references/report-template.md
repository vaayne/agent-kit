# HTML Report Template

`report-template.html` is a static renderer asset for human-readable reports. During normal code reviews, do **not** read or copy the raw HTML into the agent context. Generate `review.json` first, then render HTML from it.

## Normal Review Flow

1. Write `review.json` using [review-schema.md](review-schema.md).
2. Initialize or append `events.jsonl`.
3. Render the human report:
   ```bash
   node skills/code-review/references/render-report.mjs review.json report.html
   ```
4. Render the compact summary:
   ```bash
   node skills/code-review/references/summarize-review.mjs review.json summary.md
   ```

`review.json` is the source of truth. `report.html` and `summary.md` are derived views.

## When to Read `report-template.html`

Only read or edit `report-template.html` when changing the report design or renderer integration. It is intentionally large because it contains complete inline CSS and JS for a standalone HTML artifact; loading it during review generation wastes tokens.

## Design Direction

Tech-utility (Datadog / GitHub). Data-dense, monospace-friendly, dark-first. System sans for prose, monospace for code and metadata. Hairline borders, tabular numerics, inline status pills. No hero images, no marketing fluff — show the data.

## Rendered Sections

### Header

- Branch name, base branch, date, number of commits, files changed
- Total lines added (green) / removed (red), monospace with tabular numerics

### Summary Dashboard

- Four metric cards in a responsive grid, each with a colored left border accent
- Large tabular count + uppercase label
- One-sentence assessment below the grid in a muted panel

### Filter Bar

- Sticky frosted-glass bar at the top
- Pill-shaped toggle buttons with colored dots per severity
- "All" active by default — JS toggles `display` on `.finding` elements

### Findings

Each finding is a collapsible `<details>` card rendered from `review.json`:

- Summary row: severity pill + finding ID/title + category tag + status tag + file reference
- Body: description, impact, suggested fix, optional code block, confidence, reviewers, fingerprint
- Critical open findings are expanded by default

### Side Quests

Pre-existing issues in adjacent unchanged code. Same card format, labeled: "Pre-existing — not introduced by this PR."

### Verdict

Centered verdict card with colored border matching outcome:

- **Ship it** (green border) — no critical or high open findings
- **Fix and ship** (orange border) — high findings that need addressing, no multiple criticals
- **Rethink** (red border) — multiple criticals suggest the approach needs revision

Includes severity-based action guidance table below.

## Design Principles

- Dark mode by default, with `prefers-color-scheme: light` media query and a manual toggle button
- OKLch color system — perceptually uniform severity colors that work in both themes
- Monospace for code refs, file paths, metadata, counts; system sans for prose
- Collapsible cards via `<details>/<summary>`
- Sticky frosted filter bar with backdrop-filter blur
- Tabular numerics everywhere numbers appear
- Hairline borders, no shadows except filter bar blur
- Mobile-responsive — 2-column dashboard on small screens, file refs hidden
- Print-friendly — `@media print` forces light theme, expands details, hides interactive controls
- No external dependencies — single self-contained HTML file

## Verdict Icons

Use text symbols, not emoji:

- Ship it: `✓`
- Fix and ship: `⚠`
- Rethink: `✕`
