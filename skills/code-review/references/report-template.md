# HTML Report Template

Generate a single-file HTML report with these sections. Use clean, modern CSS — no external dependencies.

## Structure

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review — {branch-name}</title>
    <style>
    /* inline styles */
    </style>
  </head>
  <body>
    <!-- Header -->
    <!-- Summary Dashboard -->
    <!-- Findings -->
    <!-- Side Quests -->
    <!-- Verdict -->
  </body>
</html>
```

## Sections

### Header

- Branch name, base branch, date, number of commits, files changed
- Total lines added / removed

### Summary Dashboard

- Severity counts as colored badges: Critical (red), High (orange), Medium (yellow), Low (blue)
- Pie or bar chart is NOT needed — badges with counts are enough
- One-sentence overall assessment

### Findings (grouped by severity, Critical first)

Each finding card:

- Severity badge (colored)
- Title
- File path with line numbers (as a monospace code reference)
- Category tag (bug / security / architecture / correctness / performance)
- Description — what's wrong and why it matters
- Suggestion — concrete fix, shown in a code block if applicable
- Confidence indicator (high / medium / low)
- Reviewers who flagged it (e.g., "Bug Hunter, Correctness Prover")

### Side Quests (if any)

Pre-existing issues found in adjacent unchanged code. Same card format but visually distinct (e.g., dashed border or muted background). Label: "Pre-existing — not introduced by this PR."

### Verdict

One of:

- **Ship it** — no critical or high findings
- **Fix and ship** — high findings that need addressing, no criticals
- **Rethink** — multiple criticals suggest the approach needs revision

Include the severity-based action guidance table.

## Design Principles

- Dark mode by default, with a `prefers-color-scheme: light` media query for light mode
- Monospace font for code references, system font stack for prose
- Collapsible finding cards (use `<details>` / `<summary>`) — show title + severity in summary, full details inside
- Sticky severity filter bar at the top (pure CSS or minimal inline JS) that lets user show/hide by severity
- Mobile-responsive
- Print-friendly: `@media print` that expands all details and removes filters
