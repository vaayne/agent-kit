---
name: designer
description: |
  Expert designer skill for Claude Code. Produces HTML prototypes, slide decks,
  dashboards, landing pages, mobile app screens, editorial artifacts, and polished
  animated UI/micro-interactions. Includes 150+ design systems, 110+ design
  templates from Open Design, and motion guidance for transitions, scroll reveals,
  spring physics, loading skeletons, parallax, layout animation, and UI polish.
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
  - "animation"
  - "transition"
  - "motion"
  - "micro-interaction"
  - "animate"
  - "smooth"
  - "bouncy"
  - "snappy"
  - "spring"
  - "parallax"
  - "scroll reveal"
  - "loading skeleton"
  - "shimmer"
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
| `references/motion-vocabulary.md`    | Motion vocabulary, animation patterns, principles    |
| `references/design-systems.md`       | 150+ brand design systems catalog                    |
| `references/design-templates.md`     | 110+ design templates catalog with descriptions      |

## Pre-flight (before every new design task)

1. **Always read first**: `references/01-core-directives.md` — the 3 hard rules (discovery, brand branching, plan)
2. **Always read second**: `references/02-identity-workflow.md` — designer identity, output guidelines
3. **Read when needed**:
   - Direction choice → `references/03-direction-library.md`
   - Slide deck → `references/04-deck-framework.md`
   - Motion/animation/micro-interaction → `references/motion-vocabulary.md`
   - Brand/design system → `references/design-systems.md`, then `references/design-systems/<slug>/DESIGN.md` + `tokens.css`
   - Template → `references/design-templates.md`, then `references/design-templates/<slug>/SKILL.md` + `assets/template.html`

## Quick rules

- **Turn 1**: Ask discovery questions (output, platform, audience, tone, brand context, scale, constraints). Keep it under 7 questions. Lead with one short prose line.
- **Turn 2**: Branch on brand answer → extract brand spec (Branch A) or bind design system/direction (Branch B/C).
- **Turn 3+**: State your plan → read seeds → build → anti-AI-slop audit + 5-dim critique → write the HTML file.

## Motion and animation usage

Use motion to clarify relationships, state changes, and hierarchy — not as confetti. When the user asks for animation, transitions, smoothness, bounce, scroll effects, loading states, or any UI that should appear/disappear/move/change gracefully, read `references/motion-vocabulary.md` and translate vague feel words into concrete motion choices.

Decision rules:

- Prefer CSS-only animation for hover/focus/show-hide, entrances, simple keyframes, scroll reveals, and ambient loops.
- Use the project's existing animation library if one is already installed; do not add a second library for one effect.
- Use Framer Motion/Motion One/GSAP only for interruptible enter-exit, layout animation, shared element transitions, gestures, springs, or complex orchestration.
- Animate `transform` and `opacity` for motion. Avoid `width`, `height`, `top`, `left`, `margin`, and `padding` because they cause layout work and jank.
- Include `prefers-reduced-motion` handling. Replace motion with a near-instant opacity/state change when appropriate.
- Default timings: 150-250ms for frequent UI feedback, 200-300ms for entrances/exits, 300-500ms for page/view transitions, 30-80ms item stagger, 2-6s ambient loops.
- Default easing: ease-out for user-triggered responses, ease-in-out for autonomous movement, linear only for spinners/marquees, springs for interruptible or tactile motion.
- Set transform origins from the user's focus or trigger point when opening menus, popovers, cards, and modals.

## Design system usage

Read `references/design-systems/<slug>/DESIGN.md`, paste `references/design-systems/<slug>/tokens.css` `:root` block verbatim into the HTML's first `<style>`, reference `references/design-systems/<slug>/components.html` for shapes. Never invent tokens outside the palette.

## Template usage

Read `references/design-templates/<slug>/SKILL.md` and `references/design-templates/<slug>/assets/template.html`. Copy seed verbatim, bind tokens, fill content. Never write from scratch when a seed exists.

## Updating catalogs

To sync the latest design systems and templates from open-design:

```bash
./scripts/sync.sh
```
