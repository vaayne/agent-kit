---
name: design-md
description: "Create and maintain DESIGN.md files — plain-text design system documents that AI agents read to generate consistent UI. Use when the user asks to create a design system, write a DESIGN.md, define visual identity for a project, wants to borrow a design from a real site (stripe, linear, notion, etc.), or wants consistent UI generation across screens."
---

You help users create, edit, and maintain `DESIGN.md` files following the [Google Stitch format](https://stitch.withgoogle.com/docs/design-md/overview). A `DESIGN.md` is a plain-text design system document that both humans and AI agents can read, edit, and enforce.

## Awesome DESIGN.md library

[`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) is a curated collection of 55+ ready-to-use `DESIGN.md` files extracted from real developer-focused websites (Stripe, Linear, Notion, Vercel, Supabase, etc.).

**When to reach for it**: If the user says "make it look like X" or "borrow a design from Y", check this library first — there may already be a perfect `DESIGN.md` ready to drop in.

### Browse available designs

```bash
gh api repos/VoltAgent/awesome-design-md/contents/design-md | jq -r '.[].name'
```

### Read a specific design

```bash
# Replace <site> with any name from the list (e.g. stripe, linear, notion, vercel)
gh api repos/VoltAgent/awesome-design-md/contents/design-md/<site>/DESIGN.md \
  | jq -r '.content' | base64 -d
```

### Copy a design into the current project

```bash
gh api repos/VoltAgent/awesome-design-md/contents/design-md/<site>/DESIGN.md \
  | jq -r '.content' | base64 -d > DESIGN.md
```

After copying, read the file and adapt any sections to the user's specific project needs before treating it as final.

| File        | Who reads it  | What it defines                      |
| ----------- | ------------- | ------------------------------------ |
| `README.md` | Humans        | What the project is                  |
| `AGENTS.md` | Coding agents | How to build the project             |
| `DESIGN.md` | Design agents | How the project should look and feel |

## When to use

- User wants to define a project's visual identity
- User wants consistent UI generation across multiple screens
- User asks to create, update, or review a `DESIGN.md`
- User provides branding assets (URL, image, colors) to derive a design system from

## Creation paths

There are four paths to a `DESIGN.md`. Ask the user which fits their situation:

### 1. Generate from description

The user describes the vibe. You translate aesthetic intent into a complete design system.

> Example prompt: "A playful coffee shop ordering app with warm colors, rounded corners, and a friendly feel"

### 2. Derive from existing branding

The user provides a URL, screenshot, or brand guidelines. Extract palette, typography, and style patterns to build the `DESIGN.md` from what already exists.

### 3. Borrow from the awesome-design-md library

The user wants to match a real site's aesthetic. Use `gh` to pull a ready-made `DESIGN.md` from [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md), then adapt it to the project. See the **Awesome DESIGN.md library** section above for the exact commands.

### 4. Write by hand

The user wants precise control. Help them author each section with exact values.

## Format specification

→ _Consult [format reference](reference/format.md) for the complete section-by-section specification._

Every `DESIGN.md` follows this section order. Sections can be omitted if not relevant, but order should be preserved:

1. **Overview** — Holistic description of look and feel, personality, guiding aesthetic
2. **Colors** — Primary, secondary, tertiary, neutral palettes with hex values and roles
3. **Typography** — Font families and their roles across the typographic hierarchy
4. **Elevation** — How the design conveys depth (shadows vs flat)
5. **Components** — Style guidance for UI atoms (buttons, inputs, cards, etc.)
6. **Do's and Don'ts** — Practical guardrails and common pitfalls

## Workflow

### Step 1: Gather context

Before writing anything, understand the project:

- **What is the product?** (app type, platform, audience)
- **What's the aesthetic direction?** (personality, mood, visual references)
- **Any existing branding?** (colors, fonts, logos, brand guidelines)
- **Technical constraints?** (framework, accessibility requirements, dark/light mode)

If the project already has a `DESIGN.md`, read it first.

### Step 2: Draft the DESIGN.md

Write each section following the format specification. Be specific:

- Colors must include hex values AND usage roles
- Typography must specify font families AND weight/size guidance
- Components must describe variants, sizing, and states
- Do's and Don'ts must be actionable, not generic

**Be opinionated.** A design system that tries to be everything is nothing. Make clear choices:

- Commit to a color palette — don't hedge with "or similar"
- Pick specific fonts — don't say "a modern sans-serif"
- Define concrete values — `8px` radius, not "rounded"

### Step 3: Review and refine

After drafting, review against these criteria:

- **Specificity**: Could an agent generate a screen from this alone? Every value should be concrete.
- **Consistency**: Do the colors, typography, and component styles tell a coherent story?
- **Completeness**: Are there gaps an agent would have to guess at?
- **Brevity**: Is every line earning its place? Remove anything redundant.

### Step 4: Place the file

Write `DESIGN.md` to the project root, alongside `README.md`.

## Quality checklist

- [ ] Overview captures the personality in 2-3 sentences
- [ ] Every color has a hex value and a usage role
- [ ] Font families are named (not generic descriptions)
- [ ] Component styles specify radius, padding, border, and states
- [ ] Do's and Don'ts are project-specific (not generic design advice)
- [ ] An agent could generate a consistent screen from this file alone

## Example

→ _See [examples reference](reference/examples.md) for minimal and comprehensive examples._

Minimal example for a dark-themed productivity app:

```markdown
# Design System

## Overview

A focused, minimal dark interface for a developer productivity tool.
Clean lines, low visual noise, high information density.

## Colors

- **Primary** (#2665fd): CTAs, active states, key interactive elements
- **Secondary** (#475569): Supporting UI, chips, secondary actions
- **Surface** (#0b1326): Page backgrounds
- **On-surface** (#dae2fd): Primary text on dark backgrounds
- **Error** (#ffb4ab): Validation errors, destructive actions

## Typography

- **Headlines**: Inter, semi-bold
- **Body**: Inter, regular, 14-16px
- **Labels**: Inter, medium, 12px, uppercase for section headers

## Components

- **Buttons**: Rounded (8px), primary uses brand blue fill
- **Inputs**: 1px border, subtle surface-variant background
- **Cards**: No elevation, relies on border and background contrast

## Do's and Don'ts

- Do use the primary color sparingly, only for the most important action
- Don't mix rounded and sharp corners in the same view
- Do maintain 4:1 contrast ratio for all text
```
