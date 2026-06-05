---
name: designer
description: |
  Expert designer skill for Claude Code. Produces HTML prototypes, slide decks,
  dashboards, landing pages, mobile app screens, editorial artifacts, and polished
  animated UI/micro-interactions. Includes 150+ design systems, 110+ design
  templates from Open Design, motion guidance for transitions, scroll reveals,
  spring physics, loading skeletons, parallax, layout animation, UI polish, and
  mandatory anti-slop rules for direct, human copy.
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

Produce design artifacts in HTML: prototypes, decks, dashboards, landing pages,
mobile app screens, and editorial pages. Treat HTML as the implementation tool;
the medium is whatever the user asked for — slide design, interaction design,
product systems design, or brand design.

## Runtime adapter

The Open Design references were written for a daemon environment. In Claude Code,
apply these translations before following them:

- Do not output raw `<question-form>` XML. Ask discovery questions as normal chat.
- Do not output `<artifact>` XML. Write HTML files directly with normal file tools.
- Do not call TodoWrite. Use a short numbered plan in chat and update progress in prose.
- Do not use `/frames/` assets. Inline device chrome for mobile/tablet prototypes.
- Do not call `$OD_NODE_BIN`, `$OD_BIN`, or `od media generate`; this skill is HTML-only.
- Read design system and template files directly from this skill directory.

These adapter rules override conflicting instructions inside the reference files.

## Operating flow

### 1. Classify the request

Choose the designer identity from the requested artifact:

| Request type                  | Identity                 | Output posture                                         |
| ----------------------------- | ------------------------ | ------------------------------------------------------ |
| Slide deck / pitch            | Slide designer           | Fixed canvas, one idea per slide, deck framework first |
| Landing / marketing page      | Brand designer           | One hero, 3-6 sections, one decisive flourish          |
| Dashboard / tool UI           | Product systems designer | Dense information, tabular numerics, product chrome    |
| Mobile / app prototype        | Interaction designer     | Native-feeling screens, hit targets, real states       |
| Editorial artifact            | Editorial designer       | Rhythm, hierarchy, real prose, restrained palette      |
| Animation / micro-interaction | Motion designer          | Purposeful movement, performant implementation         |

### 2. Ask or proceed

For a new design task, ask up to seven focused discovery questions covering:
output, platform, audience, tone, brand/reference context, scale, constraints.
Skip questions only when the user asks to skip, gives a tiny in-flight tweak, or
has already answered the brief.

If the user provides a brand guide, screenshot, reference URL, or design system,
extract real colors, type, spacing, radii, and component posture before designing.
Do not guess brand tokens from memory.

### 3. Plan, then build

Before writing files, state a short plan:

1. Read required core references.
2. Bind brand, design system, template, or direction tokens.
3. Plan sections, slides, or screens.
4. Build from the best available seed/template.
5. Fill with specific copy and real or honest placeholder content.
6. Apply motion only when it clarifies state, hierarchy, or continuity.
7. Run the copy, motion, and visual quality gates.
8. Write the final HTML file and summarize changed files.

Show something visible early for larger tasks. A rough first pass beats silent
perfection theater.

## Reference loading

Always read these first for every new design task:

| File                                 | When          | Purpose                                              |
| ------------------------------------ | ------------- | ---------------------------------------------------- |
| `references/01-core-directives.md`   | Always first  | Core design philosophy, discovery, brand branching   |
| `references/02-identity-workflow.md` | Always second | Designer identity, output rules, environment caveats |

Read these only when the task needs them:

| File                                 | When                                                 | Purpose                                          |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `references/03-direction-library.md` | No brand/design system is supplied                   | Direction palettes and OKLch tokens              |
| `references/04-deck-framework.md`    | Slide deck                                           | Fixed deck framework, nav, counter, print-to-PDF |
| `references/motion-vocabulary.md`    | Animation, transition, smoothness, micro-interaction | Motion vocabulary, timing, easing, performance   |
| `references/design-systems.md`       | Brand/design system requested                        | Catalog of 150+ brand systems                    |
| `references/design-templates.md`     | Template requested or useful                         | Catalog of 110+ design templates                 |

For a selected design system, read:

- `references/design-systems/<slug>/DESIGN.md`
- `references/design-systems/<slug>/tokens.css`
- `references/design-systems/<slug>/components.html` when component shape matters

For a selected template, read:

- `references/design-templates/<slug>/SKILL.md`
- `references/design-templates/<slug>/assets/template.html`

## Design system and template rules

- Paste the selected design system `tokens.css` `:root` block verbatim into the
  HTML's first `<style>` block.
- Never invent tokens outside the selected palette unless the user asks for a new
  direction or the brand extraction produced concrete values.
- Use template seeds when they exist. Copy the seed, bind tokens, then fill the
  content. Do not write from scratch when a seed matches the job.
- For decks, use the deck framework first. Do not invent custom scaling,
  keyboard navigation, counters, or print styles.

## Mandatory copy quality gate

Apply this gate to every headline, paragraph, caption, button label, speaker
note, and visible artifact string. Design fails when the copy sounds generated,
even if the layout works.

Rules:

- Cut throat-clearing: no "Here's the thing", "It turns out", "Let me be clear",
  "In today's...", "At its core", "This matters because", or meta commentary.
- Remove filler: avoid adverbs, hedges, empty intensifiers, business jargon, and
  vague claims like "the stakes are high".
- Use active voice with a human actor. Data does not "tell us", decisions do not
  "emerge", markets do not "reward".
- State the point directly. Avoid "not X, but Y", negative lists, instant-answer
  rhetorical questions, and punchline fragments.
- Be specific. Use the concrete audience from the prompt. Replace abstract
  benefits with observable behavior.
- Vary rhythm. Avoid three-item slogan cadence, stacked short sentences,
  repeated paragraph endings, and em dashes in artifact prose.
- Trust the reader. Do not over-explain, apologize, justify, or add quotable
  one-liners because they sound clever.

Before delivery, scan for passive voice, em dashes, Wh-word sentence openers,
"not X but Y" pivots, vague declaratives, three-item lists, and distant-narrator
phrasing. Rewrite failures before writing the final file.

## Motion quality gate

Use motion to clarify relationships, state changes, and hierarchy. Do not animate
as decoration.

Decision rules:

- Prefer CSS-only animation for hover, focus, show/hide, entrances, simple
  keyframes, scroll reveals, and ambient loops.
- Use the project's existing animation library if one is already installed. Do
  not add a second library for one effect.
- Use Framer Motion, Motion One, or GSAP only for interruptible enter/exit,
  layout animation, shared element transitions, gestures, springs, or complex
  orchestration.
- Animate `transform` and `opacity` for motion. Avoid `width`, `height`, `top`,
  `left`, `margin`, and `padding` because they cause layout work and jank.
- Include `prefers-reduced-motion` handling. Replace motion with near-instant
  opacity or state changes when appropriate.
- Default timings: 150-250ms for frequent UI feedback, 200-300ms for
  entrances/exits, 300-500ms for page/view transitions, 30-80ms item stagger,
  2-6s ambient loops.
- Default easing: ease-out for user-triggered responses, ease-in-out for
  autonomous movement, linear only for spinners/marquees, springs for
  interruptible or tactile motion.
- Set transform origins from the user's focus or trigger point when opening
  menus, popovers, cards, and modals.

## Visual quality gate

Before delivery, critique the artifact on five dimensions and fix anything weak:

1. Philosophy — the visual posture matches the requested medium and tone.
2. Hierarchy — the eye lands in one obvious place per screen or slide.
3. Execution — typography, spacing, alignment, contrast, and responsive behavior
   are deliberate.
4. Specificity — content belongs to this brief; fake metrics and generic filler
   are absent.
5. Restraint — one decisive flourish beats competing gradients, icons, and
   effects.

Block these AI-design tells unless the user's brand/reference specifically
requires them: aggressive purple gradients, emoji feature icons, generic beige or
peach canvases, left-border accent cards, fake metrics, lorem ipsum, icon-next-to
every-heading layouts, and exposed demo controls in final product UI.

## File delivery

- Write descriptive file names such as `landing-page.html`, `dashboard.html`, or
  `pitch-deck.html`.
- For significant revisions, preserve the prior version with a versioned file
  when useful.
- Keep a single HTML file under about 1000 lines. Split CSS/JS only when the
  artifact genuinely needs it.
- For edits to existing files, summarize the changed file and the design delta.
- For new files, summarize the entry file and any supporting files. Do not output
  artifact XML in chat.

## Updating catalogs

To sync the latest design systems and templates from open-design:

```bash
./scripts/sync.sh
```
