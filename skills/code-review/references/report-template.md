# HTML Report Template

Copy `report-template.html` (in this directory) as the starting point. Replace `{placeholders}` with actual data. Do not modify the CSS foundation — only fill in dynamic content.

## Design Direction

Tech-utility (Datadog / GitHub). Data-dense, monospace-friendly, dark-first. System sans for prose, monospace for code and metadata. Hairline borders, tabular numerics, inline status pills. No hero images, no marketing fluff — show the data.

## How to Use

1. Read `report-template.html` — it is a complete standalone HTML file with all CSS and JS inlined
2. Copy the entire file as the base for the report
3. Replace `{placeholders}` in the HTML with actual review data
4. Repeat the `<details class="finding">` block for each finding, grouped by severity (critical first)
5. Remove the Side Quests section if there are none
6. Set the verdict class to `ship`, `fix`, or `rethink`

## Sections

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

### Findings (grouped by severity, Critical first)

Each finding is a collapsible `<details>` card:

- **Summary row**: severity pill + title + category tag + file:line reference (right-aligned, mono)
- **Body** (revealed on expand):
  - Description — what's wrong and why it matters
  - Suggestion panel — concrete fix with optional code block, visually distinct with raised surface background
  - Metadata footer — confidence level + which reviewers flagged it, separated by a subtle top border

### Side Quests (if any)

Pre-existing issues in adjacent unchanged code. Same card format but with dashed borders and reduced opacity. Labeled: "Pre-existing — not introduced by this PR."

### Verdict

Centered verdict card with colored border matching outcome:

- **Ship it** (green border) — no critical or high findings
- **Fix and ship** (orange border) — high findings that need addressing, no criticals
- **Rethink** (red border) — multiple criticals suggest the approach needs revision

Includes severity-based action guidance table below.

## Design Principles

- **Dark mode by default**, with `prefers-color-scheme: light` media query and a manual toggle button
- **OKLch color system** — perceptually uniform severity colors that work in both themes
- **Monospace** for code refs, file paths, metadata, counts; system sans for prose
- **Collapsible cards** via `<details>/<summary>` — critical findings open by default
- **Sticky frosted filter bar** with backdrop-filter blur
- **Tabular numerics** everywhere numbers appear
- **Hairline borders** (1px), no shadows except filter bar blur
- **Mobile-responsive** — 2-column dashboard on small screens, file refs hidden
- **Print-friendly** — `@media print` forces light theme, expands all details, hides interactive controls
- **No external dependencies** — single self-contained HTML file

## Verdict Icons

Use text symbols, not emoji:
- Ship it: `✓`
- Fix and ship: `⚠`
- Rethink: `✕`
