# Grilling Guide

Interrogate the design relentlessly before writing anything down. The goal is shared understanding — walk down each branch of the design tree and resolve dependencies between decisions one by one.

**Ask questions one at a time**, waiting for feedback before continuing. For each question, provide your recommended answer. If a question can be answered by exploring the codebase, explore instead of asking.

## Domain awareness

Look for existing documentation during codebase exploration:

- `CONTEXT-MAP.md` at repo root → multiple bounded contexts (the map points to each)
- `CONTEXT.md` at repo root → single context
- Neither → create `CONTEXT.md` lazily when the first term is resolved

## What to do during grilling

**Challenge against the glossary.** When the user uses a term that conflicts with `CONTEXT.md`, call it out: "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

**Sharpen fuzzy language.** When the user uses vague or overloaded terms, propose a precise canonical term: "You're saying 'account' — do you mean the Customer or the User?"

**Discuss concrete scenarios.** Stress-test domain relationships with specific scenarios that probe edge cases and force precision about boundaries between concepts.

**Cross-reference with code.** When the user states how something works, check whether the code agrees. Surface contradictions: "Your code cancels entire Orders, but you said partial cancellation is possible — which is right?"

**Update CONTEXT.md inline.** When a term is resolved, update `CONTEXT.md` immediately — don't batch. It's a glossary only, no implementation details. See [context-format.md](./context-format.md).

**Offer ADRs sparingly.** Only when all three hold: hard to reverse, surprising without context, result of a real trade-off. See [adr-format.md](./adr-format.md).
