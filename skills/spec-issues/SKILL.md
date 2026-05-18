---
name: spec-issues
description: >
  Turn conversation context into a PRD and/or break it into vertical-slice implementation issues
  on GitHub. Auto-detects what's needed: writes a PRD first if none exists, skips straight to
  issue breakdown if a plan is already present. Use this skill whenever the user wants to create
  a PRD, write a spec, convert a plan into issues, create implementation tickets, break down work
  into tasks, go from idea to trackable issues, or says things like "let's break this down",
  "write tickets for this", "turn this into issues", "spec this out", "make a plan", or
  "what are the work items". Also use when the user has a rough idea and wants it structured
  into actionable GitHub issues.
---

# To Plan

Synthesize conversation context into a PRD and break it into vertical-slice GitHub issues. Auto-detects what phase to start from.

## Auto-detection

Determine which phase to start from:

1. Scan the conversation for an existing PRD or plan — look for structured documents with sections like "Problem Statement", "User Stories", "Acceptance Criteria", or similar. Also check if the user passed an issue reference (number, URL, or file path) as an argument.
2. If **a PRD, spec, or plan already exists** in context → skip to Phase 2.
3. If **only a rough idea or discussion exists** → start at Phase 1.

When the user passes an issue reference as an argument, fetch it via `gh issue view <number>` and read its full body and comments — treat that as the existing plan.

---

## Phase 1: Write PRD

Synthesize what you already know from the conversation and codebase. Do NOT interview the user — just write. If critical information is genuinely missing (not just nice-to-have), ask one focused question rather than a long interview.

### 1. Explore the codebase

If you haven't already, explore the repo to understand the current state. Use the project's domain vocabulary throughout, and respect any ADRs in the area you're touching.

### 2. Sketch modules

Identify the major modules you'll need to build or modify. Look for opportunities to extract deep modules — ones that hide complexity behind a simple, testable interface.

Check with the user that these modules match their expectations and which they want tests for.

### 3. Write and publish the PRD

Write the PRD using the template below, then publish it as a GitHub issue via `gh issue create`. Apply a `prd` label (create it if it doesn't exist).

<prd-template>

## Problem Statement

The problem from the user's perspective.

## Solution

The proposed solution from the user's perspective.

## User Stories

A thorough numbered list of user stories covering all aspects of the feature:

1. As an <actor>, I want <feature>, so that <benefit>

Be extensive — this list drives the issue breakdown in Phase 2.

## Implementation Decisions

Decisions that constrain the implementation:

- Modules to build/modify and their interfaces
- Architectural decisions and schema changes
- API contracts and specific interactions
- Technical clarifications from the developer

Avoid file paths or code snippets — they go stale. Exception: prototype snippets that encode a decision more precisely than prose (state machines, schemas, type shapes). Inline only the decision-rich parts and note they came from a prototype.

## Testing Decisions

- What makes a good test (external behavior, not implementation details)
- Which modules will be tested
- Prior art in the codebase

## Out of Scope

What this PRD explicitly does NOT cover.

</prd-template>

After publishing, ask: **"PRD published. Want me to break it into implementation issues?"** Continue to Phase 2 if yes.

---

## Phase 2: Break into Issues

### 1. Gather context

Work from whatever plan exists — the PRD from Phase 1, a GitHub issue, or something the user shared in conversation.

### 2. Explore the codebase (if not already done)

Understand the current state. Issue titles and descriptions should use the project's domain vocabulary and respect ADRs.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues — thin vertical slices that cut through ALL layers end-to-end, not horizontal slices of one layer.

Each slice is either **HITL** (needs human decision — architectural choice, design review) or **AFK** (can be implemented and merged autonomously). Prefer AFK.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Order slices so earlier ones unblock later ones
</vertical-slice-rules>

### 4. Quiz the user

Present the breakdown as a numbered list. For each slice show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which slices must complete first (if any)
- **User stories covered**: which stories this addresses

Ask:

- Does the granularity feel right?
- Are dependency relationships correct?
- Should any slices be merged or split?
- Are HITL/AFK assignments correct?

Iterate until approved.

### 5. Publish issues

For each approved slice, create a GitHub issue via `gh issue create`. Publish in dependency order (blockers first) so you can reference real issue numbers in "Blocked by."

If the PRD was published as an issue in Phase 1, reference it as the parent. Apply a triage label like `ready-for-dev` (create it if needed).

<issue-template>
## Parent

#<parent-issue-number> (omit if no parent)

## What to build

Concise description of this vertical slice — end-to-end behavior, not layer-by-layer.

Avoid file paths or code snippets. Exception: prototype snippets that encode decisions more precisely than prose.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- #<issue-number> (or "None — can start immediately")

</issue-template>

Do NOT close or modify any parent issue.
