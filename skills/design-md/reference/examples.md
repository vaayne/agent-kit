# DESIGN.md Examples

## Minimal — Dark developer tool

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

---

## Comprehensive — Healthcare scheduling platform

```markdown
# Design System

## Overview

A calm, professional interface for a healthcare scheduling platform.
Accessibility-first design with high contrast and generous touch targets.
Patients range from 18-85 — clarity and readability are non-negotiable.

## Colors

- **Primary** (#1a6b4f): Confirm buttons, active navigation, success indicators
- **Secondary** (#4a6fa5): Information badges, secondary actions, links
- **Tertiary** (#c27a2b): Urgent appointments, warnings, attention markers
- **Neutral** (#6b7280): Borders, dividers, placeholder text
- **Surface** (#fafbfc): Page backgrounds
- **Surface-container** (#f1f3f5): Card backgrounds, grouped sections
- **On-surface** (#1a1a2e): Primary body text
- **On-surface-variant** (#4a4a5a): Secondary text, labels
- **Error** (#c23b22): Validation errors, cancellation actions
- **Success** (#1a6b4f): Confirmed appointments, completed states

## Typography

- **Headline Font**: Source Sans Pro, semi-bold
- **Body Font**: Source Sans Pro, regular, 16px minimum
- **Label Font**: Source Sans Pro, medium, 14px

All text must meet WCAG AAA contrast (7:1) against its background.
Line height: 1.5 for body text, 1.3 for headlines.
Never use font sizes below 14px anywhere in the application.

## Elevation

- **Level 1**: 0 1px 3px rgba(0,0,0,0.08) — cards, appointment slots
- **Level 2**: 0 4px 12px rgba(0,0,0,0.1) — dropdowns, date pickers
- **Level 3**: 0 8px 24px rgba(0,0,0,0.12) — modals, confirmation dialogs

## Components

- **Buttons**: Rounded (6px), minimum 44x44px touch target, primary uses green fill with white text, secondary uses outline with primary color border, destructive uses error red fill
- **Inputs**: 2px border, 16px padding, 16px font size (prevents iOS zoom), clear error states with icon + red border + helper text below
- **Cards**: Level 1 elevation, 12px corner radius, 16px internal padding, clear header/body separation
- **Date picker**: Calendar grid with 44px minimum cell size, today highlighted with primary outline, selected date with primary fill, unavailable dates grayed with strikethrough
- **Navigation**: Top bar with logo left, patient name right, bottom tab bar on mobile with 5 max items, active tab uses primary color
- **Status badges**: Pill shape (999px radius), confirmed=green, pending=amber, cancelled=red, each with appropriate text color for contrast

## Do's and Don'ts

- Do make touch targets at least 44x44px — many users have limited dexterity
- Do use the primary green only for confirming/positive actions
- Do show appointment times in the patient's local timezone with explicit timezone label
- Don't use color alone to convey status — always pair with text or icon
- Don't auto-close modals on a timer — patients may need more time to read
- Don't use hover-only interactions — must work on touch devices
- Don't truncate patient names or appointment details — show full information
```

---

## Moderate — E-commerce storefront

```markdown
# Design System

## Overview

A warm, inviting storefront for an artisanal home goods brand.
Photography-forward layout that lets product imagery do the talking.
Generous whitespace, understated UI, premium without being pretentious.

## Colors

- **Primary** (#8b5e3c): Add to cart, primary actions, brand accent
- **Secondary** (#2c2c2c): Text buttons, navigation links
- **Surface** (#fdf8f4): Page background, warm off-white
- **Surface-container** (#f5ede4): Card backgrounds, sections
- **On-surface** (#1a1a1a): Body text, headings
- **On-surface-variant** (#6b6560): Secondary text, metadata, prices before discount
- **Accent** (#c4553a): Sale badges, limited stock warnings
- **Error** (#b91c1c): Form validation, payment errors

## Typography

- **Headline Font**: Playfair Display, regular, for product names and page titles
- **Body Font**: Lato, regular, 16px, for descriptions and UI text
- **Label Font**: Lato, medium, 13px, uppercase with 0.05em letter-spacing for category labels and metadata

## Elevation

No shadows. Depth through background color layering and generous spacing.
Product images float on the warm surface without container borders.

## Components

- **Buttons**: Primary is brand brown fill with cream text, pill shape (999px radius), 16px 32px padding. Secondary is underlined text link. No outline buttons.
- **Product cards**: No border, no shadow. Image (4:5 ratio), product name in Playfair, price in Lato, subtle hover zoom on image (scale 1.03, 300ms ease)
- **Navigation**: Minimal top bar — logo center, cart icon right, hamburger left on mobile. Sticky on scroll with background blur.
- **Inputs**: Bottom-border only (no box), 1px neutral border, focus state changes to primary brown, labels above in small caps

## Do's and Don'ts

- Do let product photography be the hero — UI should recede
- Do use Playfair Display only for product names and page titles, never for body text
- Don't put text over product images — use space below or beside
- Don't use the accent red for anything except urgency (sale, low stock)
- Do maintain generous margins — minimum 24px between content groups
- Don't add decorative borders or dividers — whitespace is the separator
```
