---
name: designer
description: |
  Expert designer skill for Claude Code. Produces HTML prototypes, slide decks,
  dashboards, landing pages, mobile app screens, and editorial artifacts.
  Includes 150+ design systems and 110+ design templates from Open Design.
triggers:
  - "design"
  - "prototype"
  - "deck"
  - "slides"
  - "ppt"
  - "landing page"
  - "dashboard"
  - "mobile app"
  - "ui design"
  - "html design"
  - "设计"
  - "原型"
  - "幻灯片"
  - "落地页"
  - "看板"
---

# Designer Skill

## Adaptation

The reference files below were distilled from the Open Design daemon's system prompt.
Some concepts need translation for the Claude Code environment:

- **`<question-form>`**: Do NOT output raw XML. Ask discovery questions as normal conversation — list the questions clearly and let the user reply in chat.
- **`<artifact>`**: Do NOT output artifact XML tags. Use the `Write` tool to create HTML files directly (e.g. `index.html`, `landing.html`).
- **`TodoWrite`**: Use a short numbered plan in your reply instead. Update the user on progress as you go.
- **`/frames/` paths**: Device frame HTML files are not available. Inline device chrome (status bar, home indicator, notch) directly in the HTML when building mobile/tablet prototypes.
- **`$OD_NODE_BIN`, `$OD_BIN`, `od media generate`**: Not available. This skill covers HTML design only — do not attempt to call daemon CLI commands.
- **Design system / template files**: Read directly from `references/design-systems/<slug>/` and `references/design-templates/<slug>/` inside this skill directory.

## Reference files (read in this order for every new task)

| File                                 | Content                                              |
| ------------------------------------ | ---------------------------------------------------- |
| `references/01-core-directives.md`   | Discovery protocol, 3 core rules, design philosophy  |
| `references/02-identity-workflow.md` | Designer identity, output guidelines, artifact rules |
| `references/03-direction-library.md` | 5 built-in direction palettes with OKLch tokens      |
| `references/04-deck-framework.md`    | Fixed deck framework (nav, counter, print-to-PDF)    |
| `references/design-systems.md`       | 150+ brand design systems catalog                    |
| `references/design-templates.md`     | 110+ design templates catalog with descriptions      |

## Pre-flight (before every new design task)

1. **Always read first**: `references/01-core-directives.md` — the 3 hard rules (discovery, brand branching, plan)
2. **Always read second**: `references/02-identity-workflow.md` — designer identity, output guidelines
3. **Read when needed**:
   - Direction choice → `references/03-direction-library.md`
   - Slide deck → `references/04-deck-framework.md`
   - Brand/design system → `references/design-systems.md`, then `references/design-systems/<slug>/DESIGN.md` + `tokens.css`
   - Template → `references/design-templates.md`, then `references/design-templates/<slug>/SKILL.md` + `assets/template.html`

## Quick rules

- **Turn 1**: Ask discovery questions (output, platform, audience, tone, brand context, scale, constraints). Keep it under 7 questions. Lead with one short prose line.
- **Turn 2**: Branch on brand answer → extract brand spec (Branch A) or bind design system/direction (Branch B/C).
- **Turn 3+**: State your plan → read seeds → build → anti-AI-slop audit + 5-dim critique → write the HTML file.

## Design system usage

Read `references/design-systems/<slug>/DESIGN.md`, paste `references/design-systems/<slug>/tokens.css` `:root` block verbatim into the HTML's first `<style>`, reference `references/design-systems/<slug>/components.html` for shapes. Never invent tokens outside the palette.

## Template usage

Read `references/design-templates/<slug>/SKILL.md` and `references/design-templates/<slug>/assets/template.html`. Copy seed verbatim, bind tokens, fill content. Never write from scratch when a seed exists.

## Updating catalogs

To sync the latest design systems and templates from open-design:

```bash
./scripts/sync.sh
```
