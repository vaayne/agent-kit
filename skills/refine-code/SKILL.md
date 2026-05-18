---
name: refine-code
description: "Improve existing code at any scale — from cleaning up a single function to restructuring an entire module hierarchy. Use this skill whenever the user wants to simplify code, refactor for readability, find architectural improvements, consolidate tightly-coupled modules, deepen shallow abstractions, reduce complexity, clean up after a feature implementation, or make a codebase more testable and navigable. Triggers on phrases like 'simplify this', 'clean up', 'refactor', 'improve architecture', 'make this cleaner', 'find refactoring opportunities', 'reduce complexity', or any request to improve code quality without changing behavior."
---

# Refine Code

Improve existing code without changing what it does — only how it's organized, how readable it is, and how deep its abstractions run.

This skill operates in two modes, chosen automatically based on what the user asks for:

- **Code mode** — sharpen specific files or recent changes for clarity, consistency, and maintainability
- **Architecture mode** — find structural friction across modules and propose deepening opportunities

If the user's request is scoped to specific files or recent changes, use Code mode. If they're asking about module boundaries, coupling, testability, or codebase-wide structure, use Architecture mode. If both apply (e.g., "clean up this area and think about whether the abstraction is right"), do both — Code mode first for immediate improvements, then Architecture mode for structural suggestions.

If a Code mode analysis reveals that the real problem is structural (e.g., a function is messy because it's doing three unrelated things that belong in different modules), say so and offer to switch to Architecture mode for that piece.

---

## Code Mode

Refinement means making existing code clearer — not adding new capabilities. Don't suggest new error handling, new features, debug commands, or logging unless the user asked for them. The goal is to reduce what a reader must hold in their head to understand the code.

### The core question

For every function, type, variable, or abstraction in scope, ask: **"Does this earn its complexity?"**

- **The deletion test** — imagine deleting this abstraction. If the callers get simpler, it was a pass-through adding indirection without value. If complexity reappears across N call sites, it was earning its keep.
- **The reader test** — if a new team member read this code top-to-bottom, where would they get confused? Where would they need to jump to another file to understand what's happening? Those are your improvement targets.
- **The type test** — are types telling the truth? A `Record<string, unknown>` that's always `{name: string, age: number}` forces every consumer to narrow manually. Types that lie create casts; casts hide bugs.

### What earns a suggestion

Rank suggestions by how much cognitive load they remove, not by how many lines they save. A renamed variable that prevents misreading is worth more than a 10-line deduplication that adds an abstraction.

Good suggestions:

- Narrowing a type so downstream code drops casts and guards
- Extracting a local variable to name a repeated sub-expression (clarity, not DRY)
- Consolidating scattered related logic that forces a reader to jump between files
- Removing dead code, unreachable branches, or redundant fallbacks
- Simplifying defensive patterns that guard against impossible states (e.g., `globalThis.process?.env` in a file that imports `node:fs`)

Not refinement (don't suggest these unless asked):

- Adding error handling, retry logic, or fallback behavior
- Adding debug commands, logging, or observability
- Adding feature parity with sibling modules ("the other provider has X")
- Adding comments that restate what the code does

### Process

1. **Scope** — identify what's in scope (files the user named, or recent changes via `git diff`)
2. **Context** — read CLAUDE.md and neighboring files to understand project conventions. Compare against sibling modules when they exist (e.g., if cleaning up `provider-a/index.ts`, read `provider-b/index.ts` for style)
3. **Analyze** — apply the deletion test, reader test, and type test. Note each finding with the file path and line range
4. **Prioritize** — rank findings by cognitive-load reduction. Group into a summary table with impact (high/medium/low) and risk (none/low)
5. **Present** — show concrete before/after snippets for each suggestion. If a suggestion touches types, show how downstream code simplifies as a result

---

## Architecture Mode

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is leverage for callers and locality for maintainers.

### Vocabulary

Use these terms consistently in every suggestion. Don't substitute "component," "service," "API," or "boundary." Full definitions in [references/LANGUAGE.md](references/LANGUAGE.md).

| Term          | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| **Module**    | Anything with an interface and an implementation (function, class, package, slice) |
| **Interface** | Everything a caller must know: types, invariants, error modes, ordering, config    |
| **Depth**     | Leverage at the interface — lots of behaviour behind a small interface             |
| **Seam**      | Where an interface lives; where behaviour can be altered without editing in place  |
| **Adapter**   | A concrete thing satisfying an interface at a seam                                 |
| **Leverage**  | What callers get from depth                                                        |
| **Locality**  | What maintainers get from depth: change and bugs concentrate in one place          |

Key principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam.
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a seam unless something actually varies across it.

### Process

#### 1. Explore

If the project has a domain glossary (CONTEXT.md) or ADRs, read them first — they tell you what terms mean and which past decisions are intentional. If they don't exist, that's fine — most repos don't. Proceed from the code itself.

Use the Agent tool with `subagent_type=Explore` to walk the codebase. Note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow.

#### 2. Present candidates

Present a numbered list of deepening opportunities. For each:

- **Files** — which files/modules are involved
- **Problem** — why the current structure causes friction
- **Solution** — plain English description of what would change
- **Benefits** — in terms of locality and leverage, and how tests improve

Use [references/LANGUAGE.md](references/LANGUAGE.md) vocabulary for the architecture. If the project has a CONTEXT.md, use its domain terms too.

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when friction is real enough to warrant revisiting. Mark it clearly. (Skip this if the project has no ADRs.)

Also note modules you examined and found to be **healthy** — a brief "X earns its keep because Y" verdict helps the user understand what you considered, not just what you flagged.

Do NOT propose interfaces yet. Ask: "Which of these would you like to explore?"

#### 3. Grilling loop

Once the user picks a candidate, walk the design with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

As decisions crystallize:

- **User rejects a candidate with a load-bearing reason?** Offer to record it (as an ADR or a comment in the code) so future reviews don't re-suggest it.
- **Want to explore alternative interfaces?** See [references/INTERFACE-DESIGN.md](references/INTERFACE-DESIGN.md).
- If the project has a CONTEXT.md and you've introduced or sharpened a domain term, update it inline.

For dependency handling and testing strategy during deepening, see [references/DEEPENING.md](references/DEEPENING.md).
