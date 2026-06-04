---
name: ui-animation
description: >
  Build UI components with polished, performant animations. Use this skill whenever a user wants to add motion to their interface — entrance/exit animations, scroll reveals, layout transitions, spring physics, loading skeletons, number tickers, parallax, or any other animated UI element. Also use when the user describes how something should *feel* ("smooth", "bouncy", "snappy", "subtle") or asks for help choosing the right animation approach. Triggers on: "animate", "transition", "fade in", "slide in", "pop in", "bounce", "spring", "parallax", "scroll animation", "loading skeleton", "shimmer", "typewriter effect", "number ticker", "morph", "shared element transition", "layout animation", "stagger", "easing", or any request involving motion in a UI. Even if the user doesn't say "animation" explicitly — if they want something to appear, disappear, move, or change smoothly, this skill applies.
---

# UI Animation

You help users build animated UI by translating what they want into precise animation vocabulary, then implementing it with the right technology for their project.

## How this skill works

Animation requests come in two flavors:

1. **Vague intent** — "make this feel smooth", "I want a nice entrance for the cards", "the modal should be bouncy". Your job: translate this into specific vocabulary (pop-in with spring easing, staggered fade-in, etc.), confirm with the user, then implement.

2. **Specific technique** — "add parallax scrolling", "I need a shared element transition between the list and detail view". Your job: implement it well, with the right performance characteristics.

In both cases, consult `references/vocabulary.md` when you need to identify the right technique or explain a concept to the user. That file is the shared language between you and the user.

## Decision framework

When the user describes what they want, work through this:

### 1. What's the motion?

Map their description to vocabulary terms. "Cards should cascade in" → stagger + fade-in + slide-in. "The panel should feel alive" → float or pulse (idle animation). "Navigate between pages smoothly" → page transition or view transition.

If the description is ambiguous, name 2-3 options with their tradeoffs rather than guessing.

### 2. What technology fits?

Pick based on the project's stack and the animation's complexity:

| Situation                                          | Reach for                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Simple state transitions (hover, focus, show/hide) | CSS `transition`                                                              |
| Keyframed sequences, loops, ambient motion         | CSS `@keyframes`                                                              |
| Scroll-driven animations                           | CSS `animation-timeline: scroll()` or Intersection Observer                   |
| Enter/exit, layout animation, gesture-driven       | Framer Motion (React), Motion One, or GSAP                                    |
| Spring physics, interruptible animations           | Framer Motion `spring`, react-spring, or Motion One                           |
| Shared element / view transitions                  | View Transitions API (if browser support is OK), or Framer Motion `layoutId`  |
| Complex orchestration (stagger, timeline)          | GSAP timeline, Framer Motion variants, or CSS with custom properties + delays |
| SVG line drawing, morphing                         | GSAP + MorphSVG, or manual `stroke-dashoffset`                                |

Rules of thumb:

- If it can be CSS-only, make it CSS-only. CSS animations are composited by the GPU and don't block the main thread.
- If the project already uses Framer Motion or GSAP, use what's there. Don't add a second animation library.
- If no animation library exists and CSS alone can't do it, recommend Framer Motion for React or Motion One for vanilla/other frameworks.
- For one-off effects that don't justify a library, vanilla JS with `requestAnimationFrame` or Web Animations API works.

### 3. Get the details right

Every animation needs these decisions:

**Duration** — Most UI animations land between 150ms and 500ms. Entrances/exits: 200-300ms. Layout shifts: 200-400ms. Page transitions: 300-500ms. Ambient/loop: 2-6s. The more frequently a user sees an animation, the shorter it should be.

**Easing** — Default to ease-out for anything the user triggered (it responds immediately, then settles). Use ease-in-out for elements moving on their own. Avoid ease-in for UI — it feels sluggish. Use linear only for infinite loops (spinners, marquees). For organic feel, use a spring or asymmetric cubic-bezier.

**Stagger** — When animating a list, 30-80ms between items works. Keep total cascade under 500ms or it feels slow.

**Transform origin** — If the animation relates to a trigger (button opens a menu, thumbnail expands to card), set the origin to the trigger's position. Elements should animate _from where the user was looking_.

## Performance rules

These are non-negotiable:

1. **Only animate `transform` and `opacity`** for motion. These are composited — the GPU handles them without layout recalculation. Animating `width`, `height`, `top`, `left`, `margin`, or `padding` causes layout thrashing and jank.

2. **Use `will-change` sparingly.** Only add it to elements that are about to animate, and remove it after. Don't blanket-apply it — each `will-change` element gets its own compositing layer, which costs memory.

3. **Test at 4x CPU throttle.** Chrome DevTools → Performance → CPU throttle. If it's smooth there, it's smooth everywhere.

4. **Respect `prefers-reduced-motion`.** Always include a reduced-motion media query that either removes the animation entirely or replaces it with a simple crossfade/opacity change. This is an accessibility requirement.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

For Framer Motion, use `useReducedMotion()` to conditionally simplify animations.

## Implementation patterns

### CSS entrance with stagger

```css
.card {
  opacity: 0;
  transform: translateY(20px);
  animation: card-enter 300ms ease-out forwards;
}

@keyframes card-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stagger with custom property */
.card { animation-delay: calc(var(--i) * 60ms); }
```

Set `--i` per element (0, 1, 2, ...) via `style` attribute or a loop.

### Spring animation (Framer Motion)

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ type: "spring", stiffness: 300, damping: 24 }}
/>;
```

Spring presets:

- **Snappy**: stiffness 400, damping 30 — quick, minimal overshoot
- **Bouncy**: stiffness 300, damping 15 — playful overshoot
- **Gentle**: stiffness 150, damping 20 — slow, smooth settle

### Scroll reveal (Intersection Observer)

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
```

### Scroll-driven animation (CSS)

```css
@keyframes parallax {
  from { transform: translateY(0); }
  to { transform: translateY(-100px); }
}

.parallax-element {
  animation: parallax linear;
  animation-timeline: scroll();
  animation-range: entry 0% exit 100%;
}
```

### Layout animation (Framer Motion)

```tsx
<motion.div layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
  {/* Content that changes size/position */}
</motion.div>;
```

### Number ticker

```css
.ticker {
  font-variant-numeric: tabular-nums;
}
```

Use `tabular-nums` so digits don't shift horizontally as values change. For the rolling effect, animate a vertical strip of digits with `translateY`.

### Skeleton shimmer

```css
.skeleton {
  background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

## When the user asks for advice

If the user isn't sure what animation to use, help them think through it:

- **What action triggered this?** User click → ease-out, fast (150-250ms). System event → ease-in-out, moderate (250-400ms). Nothing (ambient) → linear or slow ease-in-out (2-6s).
- **How often will they see it?** Daily → keep it under 200ms and subtle. First-time onboarding → go bigger, 300-500ms, with personality.
- **What relationship are you showing?** Parent-child → scale from parent's position. Peer → crossfade or slide. Sequential → stagger.
- **Is it interruptible?** If the user might trigger the reverse mid-animation (open/close a menu, toggle a panel), use springs — they handle interruption gracefully by carrying velocity into the new target.

## Vocabulary reference

For the full glossary of animation terms and concepts, read `references/vocabulary.md`. Use it when:

- You need to identify the right technique for a user's description
- You want to explain a concept to the user in precise terms
- You're choosing between similar approaches (e.g., crossfade vs. morph vs. shared element transition)
