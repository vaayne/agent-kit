# Design craft

The depth behind SKILL.md — read for any substantial build. SKILL.md owns the flow and
the quality gates; this file owns the personas, the brand-extraction procedure, the
cross-platform contracts, and the implementation gotchas.

## Embody the specialist

Pick the persona before writing CSS, and design the way that specialist would.

- **Responsive / cross-platform** → product systems designer. Define shared information
  architecture first, then explicit breakpoint variants: mobile compact (360px), mobile
  standard/large (390–430px), foldable/small tablet (600–744px), tablet portrait
  (768–834px), tablet landscape (1024–1180px), laptop (1280–1366px), desktop
  (1440–1536px), wide (1920px). Use container queries, fluid `clamp()` scales, and
  semantic thresholds for web; device frames for app surfaces. Never just shrink desktop
  cards into a phone viewport.
- **Slide deck** → slide designer. Fixed canvas, scale-to-fit, one idea per slide,
  headlines ≥ 36px, body ≥ 22px, visible counter, theme rhythm (no 3+ same-theme in a
  row).
- **Mobile app prototype** → interaction designer. Real device frame (Dynamic Island,
  status bar SVGs, home indicator), 44px hit targets, real screens — not "feature one"
  placeholders.
- **Landing / marketing** → brand designer. One hero, 3–6 sections, real copy, one
  decisive flourish.
- **Dashboard / tool UI** → systems designer. Information density is the feature.
  Monospace numerics, tabular data, no decoration.

## Brand-spec extraction

When the user supplies a brand spec, guide, reference site, or screenshot, extract real
values before designing — each step in its own Bash / Read / WebFetch call:

1. **Locate the source.** List attached files; or fetch `<brand>.com/brand`, `/press`,
   `/about` via WebFetch.
2. **Download styling artefacts.** CSS, brand-guide PDF, screenshots.
3. **Extract real values.** `grep -E '#[0-9a-fA-F]{3,8}'` the CSS for hex; eyeball
   screenshots for type. Never guess colors from memory.
4. **Codify.** Write `brand-spec.md` to the workspace root: six OKLch color tokens
   (`--bg`, `--surface`, `--fg`, `--muted`, `--border`, `--accent`), display + body +
   mono font stacks, and 3–5 layout posture rules you observed (radii, border weight,
   accent budget).
5. **Vocalise.** State the system in one sentence ("deep navy product canvas, single
   electric-cyan accent at oklch(68% 0.16 220), geometric display + system body") so the
   user can redirect cheaply.

When a design system is active and the user also provides a source, extract the source,
then reconcile it with the design system before building.

## Anti-slop checklist (audit before shipping)

- ❌ Aggressive purple/violet gradient backgrounds
- ❌ Generic emoji feature icons (✨ 🚀 🎯 …)
- ❌ Rounded card with a left coloured border accent
- ❌ Hand-drawn SVG humans / faces / scenery
- ❌ Inter / Roboto / Arial as a _display_ face (body is fine)
- ❌ Invented metrics ("10× faster", "99.9% uptime") without a source
- ❌ Filler copy — "Feature One / Feature Two", lorem ipsum
- ❌ An icon next to every heading; a gradient on every background
- ❌ Warm beige / cream / peach / pink / orange-brown page backgrounds unless the brand,
  screenshots, or chosen direction require them
- ❌ Product artifacts that expose designer settings, viewport selectors, platform
  toggles, target-count badges, or demo controls as if they were app UI

When you lack a real value, leave a short honest placeholder (`—`, a grey block, a
labelled stub). An honest placeholder beats a fake stat.

## Color and type

Prefer the active design system's palette or the chosen direction's. If extending,
derive harmonious colors with `oklch()` instead of inventing hex. Choose the background
from the product domain, brand, screenshots, or direction — never generic app chrome or
a default cozy canvas. For utilities, marketplaces, dashboards, and SaaS, start from
neutral or brand-colored foundations; don't fall back to warm beige/peach/pink canvases
just because no brand was given. Pair a display face with a quieter body face — never
the same family (the only exception is the tech/utility direction, intentionally one
family). One accent color, used at most twice per screen.

## Variations, junior-pass, restraint

- **Variations, not "the answer."** When the user is exploring, default to 2–3
  differentiated directions on the same brief — different color, type personality,
  rhythm. Mid-flight, prefer small in-place tweaks over multiplying files.
- **Junior-pass first.** Show something visible early, even a wireframe with grey blocks
  and labelled placeholders — and say it's a wireframe. The user redirects cheaply here.
- **Restraint over ornament.** "One thousand no's for every yes." One decisive flourish
  — an orchestrated load animation, a striking pull quote, one piece of real photography
  — separates work from a sketch. Three competing flourishes turn it back into noise.

## Cross-platform contracts

When the user picks multiple platform targets or the brief says responsive, design the
same product across surfaces instead of one web-only page. Generate separate
files/screens per target; `index.html` is only an overview/launcher when multiple files
exist.

- **Responsive web** — desktop, tablet, and mobile states for the same product. Verify
  no horizontal scroll at 360 / 390 / 430 / 600 / 820 / 1024 / 1366 / 1440 / 1920px. The
  mobile layout is redesigned for small screens with usable spacing and real navigation,
  not a squeezed desktop.
- **iOS app** (`mobile-ios.html`) — iPhone frame, Dynamic Island/status/home indicators,
  44px hit targets, iOS-safe bottom nav or sheets, no Android Material nav.
- **Android app** (`mobile-android.html`) — Pixel frame, status + nav bar, 48dp hit
  targets, Material navigation, no iOS-only chrome.
- **Tablet** (`tablet.html`) — split panes, sidebars, inspectors, larger touch targets;
  don't just scale the phone UI up.
- **Desktop app** — chrome/sidebar density, keyboard-friendly states, resizable panes,
  hover/focus states.
- **App-specific modules** (default, not optional) — domain modules inside the app:
  player controls for media, streak/check-in for habits, cart/order/coupon for commerce,
  balance/transaction/budget for finance, with states and interaction notes.
- **OS widgets / quick-access surfaces** — only when requested.

Inline the device chrome (status bar, Dynamic Island, home indicator, browser window)
directly in the artifact; this runtime doesn't serve shared frame assets. Put shared
tokens and content in one root CSS system, then create platform-specific files or
clearly labelled sections so reviewers can compare native adaptations side by side.

## Reading documents and images

Read Markdown, HTML, and plaintext natively, and images the user attaches (absolute or
workspace-relative paths). Treat a pasted image as visual reference: lift palette,
layout, tone — don't promise pixel-perfect recreation unless asked, and don't embed user
images by URL unless they want that. Extract PDF / PPTX / DOCX via Bash (`unzip`,
`pdftotext`) when the binary is available; otherwise ask the user to convert.

## React + Babel (inline JSX)

Default to Preact single-file HTML (SKILL.md Output strategy). Reach for React + Babel
only when a brief genuinely needs it; then use these exact pinned versions and integrity
hashes:

```html
<script
  src="https://unpkg.com/react@18.3.1/umd/react.development.js"
  integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L"
  crossorigin="anonymous"
></script>
<script
  src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"
  integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm"
  crossorigin="anonymous"
></script>
<script
  src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
  integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y"
  crossorigin="anonymous"
></script>
```

- **Style-object naming.** Name global style objects by component
  (`const terminalStyles = { … }`). Never a bare `const styles = { … }` — duplicate
  names across files break the page. Inline styles are fine too.
- **Babel scope.** Each `<script type="text/babel">` gets its own scope. Share
  components by exporting at the file's end: `Object.assign(window, { Terminal, Line })`.
  Avoid `type="module"` on script imports — it breaks Babel transpilation.

## Implementation gotchas

- Don't use `scrollIntoView` — it can break the embedded preview. Use other DOM scroll
  methods.
- Watch CSS selector specificity. Type-based (`.section`) and element/role-based
  (`.cta`) selectors easily cancel each other out, especially on section padding/margins.
  Keep the cascade deliberate.
- Keep individual files under ~1000 lines; split into smaller JSX/CSS files past that.
- For anything with a current position (decks, slideshows), persist it to localStorage so
  a refresh doesn't lose the user's place.

## Verification and finish

- Before delivering, sanity-check the file. If you used Bash, grep your own output for
  broken tags or missing braces. For JS prototypes, trace the main interaction — the user
  lands on whatever you ship; make sure it doesn't crash on load.
- Don't recreate copyrighted designs (other companies' distinctive UI, branded
  elements). Build something original instead.
- Don't surprise-add content the user didn't ask for — ask first.
- Don't narrate tool calls; spend your prose on design decisions.

HTML, CSS, SVG, and modern JS do far more than most users expect. Within taste and the
brief, look for the move a notch more ambitious than what was asked — one decisive
flourish is what separates a real piece from a sketch.
