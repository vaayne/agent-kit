# Plan Template

A useful plan explains **why**, not just what. For each significant decision, cover what you decided, what alternatives you ruled out and why, and what tradeoffs you accepted. The goal is that a reader who wasn't in the original conversation can understand and critique it.

Not every plan needs every section. Small plans can compress.

```markdown
# Plan: <short title>

## Problem

What is broken or missing and why it matters.

## How we got here

What you read or explored to understand the current state. This gives reviewers
confidence that the plan is grounded in the actual codebase, not assumptions.

## Design decisions

One section per significant decision. For each:

- What was decided
- What alternatives were ruled out and why
- What tradeoffs were accepted

## What changes where

Concrete list: file → what changes. Enough detail that a reviewer can follow
without reading the code themselves.

## Migration / implementation order

Sequenced steps. Include the reason for the sequence when it isn't obvious
(e.g. "step 8 is last so the compiler catches missed callsites").

## Tasks

Phase-by-phase breakdown. See implementation-guide.md for format.
```
