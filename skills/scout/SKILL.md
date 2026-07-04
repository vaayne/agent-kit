---
name: scout
metadata:
  source: https://x.com/trq212/status/2073100352921215386
description: >
  Scout the territory before building — a map-vs-territory diagnostic plus
  eight lightweight techniques (blindspot pass, brainstorm prototypes,
  interview, references, decision-first plans, deviation notes, explainers,
  quizzes) for finding your unknowns before they get expensive, applied inline
  with no workflow ceremony. Use when the user starts unfamiliar work, says
  "scout this", "blindspot pass", "unknown unknowns", "我不熟这块", "帮我找盲区",
  can't articulate what they want, or a long-horizon task came back wrong and
  planning harder isn't helping.
---

# Scout

Distilled from Thariq's _A Field Guide to Fable: Finding Your Unknowns_.

Premise: the prompt and context are the **map**; the codebase and its real constraints are the **territory**. The gap between them is the user's **unknowns**, and work quality is bottlenecked by clarifying them — before, during, and after implementation. This skill is a toolkit, not a workflow: diagnose, pick one technique, run it inline. Produce no artifact beyond what the technique itself outputs.

## Diagnose first

Before picking a technique, collect the user's starting point — experience with the domain, familiarity with this part of the codebase, where they are in their thought process. Every technique below degrades to generic output without it. Then place the unknowns:

| Quadrant         | Signal                         | Technique              |
| ---------------- | ------------------------------ | ---------------------- |
| Known knowns     | Already in the prompt          | Just work              |
| Known unknowns   | "I haven't decided X yet"      | Interview              |
| Unknown knowns   | "I'll know it when I see it"   | Prototypes, References |
| Unknown unknowns | Unfamiliar domain or code area | Blindspot pass first   |

## Before implementation

- **Blindspot pass** — the user doesn't know what questions to ask. Survey the territory for them: what good looks like, prior art in the repo, common potholes, the domain vocabulary. Teach, don't list — the output should upgrade their next prompt, not just enumerate gaps.
- **Brainstorm + prototypes** — criteria they'd only recognize on sight. Show several genuinely different directions with fake data before wiring anything up (HTML artifact for anything visual). Also works for scope: brainstorm interventions from cheapest to most ambitious and let them react.
- **Interview** — one question at a time, prioritizing questions whose answers would change the architecture. The `grill` skill is the heavy-duty version.
- **References** — when pointing beats describing. Source code is the best reference: read the implementation they like (any language) and reimplement its semantics, not its surface.
- **Decision-first plan** — order the plan by what the user is most likely to tweak: data models, type interfaces, user-facing flows on top; mechanical refactors at the bottom. The `blueprint` skill owns this; `spec-dev` for the full gated workflow.

## During implementation

- **Deviation notes** — unknowns surface mid-flight no matter how good the plan. On hitting one: pick the conservative option, log it under a `Deviations` heading in `implementation-notes.md`, keep going. The log feeds the next attempt's map.

## After implementation

- **Explainer / pitch** — reviewers start with the same unknowns the user had. Package prototype, spec, and deviation notes into one doc that answers them up front.
- **Quiz** — the user merges only what they can pass a quiz on. Report what changed with context and intuition, quiz at the bottom, perfect score before merge. The `teach` skill is the full loop.

## The habit

When a long-horizon task comes back wrong, the instinct is to plan harder; the fix is usually to find the unknowns the plan was silent about. Every technique here is a cheap way to learn something before it gets expensive to fix.
