# DESIGN.md Format Reference

Complete section-by-section specification for authoring `DESIGN.md` files.

## Section order

Sections can be omitted if not relevant, but this order should be preserved:

1. Overview
2. Colors
3. Typography
4. Elevation
5. Components
6. Do's and Don'ts

---

## Overview

A holistic description of the design's look and feel. Describe the personality: playful or professional? Dense or spacious? This guides high-level decisions when no specific token applies.

```markdown
## Overview

A calm, professional interface for a healthcare scheduling platform.
Accessibility-first design with high contrast and generous touch targets.
```

**Tips:**

- 2-3 sentences is ideal
- Name the product type and audience
- Describe the feeling, not just the features

---

## Colors

The primary, secondary, tertiary, and neutral palettes. Each color must include its hex value and its role describing what it should be used for.

```markdown
## Colors

- **Primary** (#2665fd): CTAs, active states, key interactive elements
- **Secondary** (#6074b9): Supporting actions, chips, toggle states
- **Tertiary** (#bd3800): Accent highlights, badges, decorative elements
- **Neutral** (#757681): Backgrounds, surfaces, non-chromatic UI
```

### Named colors

Beyond the base palette, design systems often need additional named colors derived from the base values. These follow Material color role conventions:

| Role                | Purpose                                |
| ------------------- | -------------------------------------- |
| `surface`           | Page and card backgrounds              |
| `on-primary`        | Text/icons on primary color            |
| `on-surface`        | Primary text on surface                |
| `surface-container` | Elevated surface areas                 |
| `surface-variant`   | Alternative surface for contrast       |
| `error`             | Validation errors, destructive actions |
| `outline`           | Borders, dividers                      |

**Tips:**

- Always include hex values — never say "a warm blue"
- Always include usage roles — colors without context are ambiguous
- Include error/success/warning colors if the app has form validation or status indicators

---

## Typography

Font families and their roles across the typographic hierarchy: display, headline, title, body, and label levels.

```markdown
## Typography

- **Headline Font**: Inter
- **Body Font**: Inter
- **Label Font**: Inter

Headlines use semi-bold weight. Body text uses regular weight at 14-16px.
Labels use medium weight at 12px with uppercase for section headers.
```

### Font pairing considerations

The relationship between headline and body fonts matters:

| Combination                       | Effect                                        |
| --------------------------------- | --------------------------------------------- |
| Same family (e.g., Inter + Inter) | Uniformity, clean, systematic                 |
| Serif headline + sans-serif body  | Visual contrast, editorial feel               |
| Display headline + neutral body   | Personality in headlines, readability in body |

**Tips:**

- Name specific font families, not generic descriptions
- Specify weight, size, and any special treatment (uppercase, letter-spacing)
- Consider font loading — Google Fonts are safe for web; system fonts for native

---

## Elevation

How the design conveys depth and hierarchy. Some designs use shadows; others stay flat.

```markdown
## Elevation

This design uses no shadows. Depth is conveyed through border contrast
and surface color variation (surface, surface-container, surface-bright).
```

For designs that use shadows:

```markdown
## Elevation

- **Level 1**: 0 1px 2px rgba(0,0,0,0.1) — cards, dropdowns
- **Level 2**: 0 4px 8px rgba(0,0,0,0.12) — modals, popovers
- **Level 3**: 0 8px 24px rgba(0,0,0,0.16) — dialogs, floating actions
```

**Tips:**

- Flat designs should explicitly state "no shadows" and explain what conveys depth instead
- Shadow designs should specify levels with exact CSS values
- This section is often omitted for simple projects — that's fine

---

## Components

Style guidance for component atoms. Focus on the components most relevant to your application.

| Component         | What to specify                                                                 |
| ----------------- | ------------------------------------------------------------------------------- |
| **Buttons**       | Variants (primary, secondary, tertiary), sizing, padding, corner radius, states |
| **Chips**         | Selection, filter, and action variants                                          |
| **Lists**         | Item styling, dividers, leading/trailing elements                               |
| **Inputs**        | Text fields, text areas, labels, helper text, error states                      |
| **Checkboxes**    | Checked, unchecked, indeterminate states                                        |
| **Radio buttons** | Selected and unselected states                                                  |
| **Tooltips**      | Positioning, colors, timing                                                     |
| **Cards**         | Elevation, border, padding, corner radius                                       |
| **Navigation**    | Bar style, active/inactive states, icons                                        |
| **Tables**        | Header styling, row hover, cell padding, borders                                |

```markdown
## Components

- **Buttons**: Rounded (8px), primary uses brand blue fill, secondary uses outline
- **Inputs**: 1px border, surface-variant background, 12px padding
- **Cards**: No elevation, 1px outline border, 12px corner radius
```

**Tips:**

- Only document components your app actually uses
- Specify concrete values (px, colors) not vague descriptions
- Include states (hover, active, disabled, error) for interactive elements
- Suggest components based on your project's context (e.g., data tables for dashboards, navigation bars for mobile apps)

---

## Do's and Don'ts

Practical guidelines and common pitfalls. These act as guardrails during design generation.

```markdown
## Do's and Don'ts

- Do use the primary color only for the single most important action per screen
- Don't mix rounded and sharp corners in the same view
- Do maintain WCAG AA contrast ratios (4.5:1 for normal text)
- Don't use more than two font weights on a single screen
```

**Tips:**

- Make these project-specific, not generic design advice
- Each rule should be testable — "Do maintain 4.5:1 contrast" not "Do use good contrast"
- Include rules that address your project's specific risks (e.g., information density for dashboards, touch targets for mobile)

---

## The dual representation

The markdown is for human collaboration. Agents also maintain structured tokens (hex values, font enums, spacing scales) for enforcement. This means:

- **Approximate is fine**: "warm colors, rounded feel" gets translated into precise tokens
- **Exact is respected**: `#2665fd`, `8px radius` are used literally
- Both representations describe the same design system
