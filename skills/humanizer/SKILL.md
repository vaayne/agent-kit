---
name: humanizer
description: |
  Remove AI writing patterns from prose and make drafts sound like a specific
  human wrote them. Use when drafting, editing, rewriting, reviewing, or cleaning
  copy, essays, docs, posts, emails, UI copy, bios, reports, or any text that
  feels generic, polished-but-dead, promotional, formulaic, or AI-generated.
  Combines comprehensive AI-writing pattern detection with a strict stop-slop
  final pass for direct, specific, human prose.
---

# Humanizer

Turn text that sounds model-written into text that sounds human-written. The goal
is not to add quirks or make the prose messy. Preserve meaning and author intent
while removing AI tells, promotional padding, formulaic structure, and the fake
smoothness that makes text feel generated.

## Workflow

1. **Classify the task**
   - If the user asks to humanize, de-AI, or make text sound natural, rewrite the text.
   - If the user asks for a review or AI-writing audit, return a concise issue list and fixes.
   - If the user provides a file path, read the file and either rewrite or edit it as requested.
   - If the user provides a writing sample, calibrate to that voice before rewriting the target text.

2. **Preserve meaning and coverage**
   - Keep the core information and stance.
   - Cover the same substantive points as the source.
   - Flag suspicious facts, citations, and data. Do not invent sources to patch gaps.

3. **Audit patterns before rewriting**
   - For a thorough review, read `references/ai-writing-patterns.md`.
   - For a fast, strict cleanup, read `references/stop-slop-rules.md`.
   - Look for clusters of tells. Do not rewrite normal human prose because of one em dash, one formal word, or one transition.

4. **Run the stop-slop final gate**
   - Cut greeting residue, meta commentary, filler, fake profundity, and boilerplate.
   - Prefer active voice and concrete nouns.
   - The final rewrite must contain no em dash or en dash.

## Output format

Default output:

```md
## AI tells

- [the 3-6 most important problems]

## Rewrite

[final rewrite]

## Notes

- [optional: fact risks, voice choices, preservation/removal rationale]
```

If the user asks for final-only output, direct file edits, or no explanation, skip
the commentary and provide only the result.

## Voice calibration

When the user provides a writing sample, inspect it before rewriting:

- Sentence length: short, long, or mixed?
- Word choice: casual, technical, formal, sharp, plain?
- Paragraph openings: direct, contextual, narrative?
- Punctuation habits: parentheses, colons, semicolons, dash substitutes?
- Transitions: explicit connectors or hard cuts?

Use the sample's rhythm and vocabulary to replace AI patterns. Do not sand the
author's voice into clean but boring prose.

## Rewrite principles

- **Be direct**: fewer announcements, more statements.
- **Be specific**: use people, places, actions, numbers, and constraints instead of abstract judgment.
- **Keep rhythm alive**: mix sentence lengths. Avoid slogan triples.
- **Name the actor**: people and systems act. Data, markets, culture, and decisions do not act on their own.
- **Avoid inflated importance**: do not wrap ordinary facts in significant, crucial, pivotal, or transformative language.
- **Add personality only when it belongs**: technical docs, legal text, and reference prose should stay plain. Essays, talks, posts, and personal writing can carry more edge.

## Final hard check

Before delivery:

- Any opener like "Here's the thing", "It turns out", "Let me be clear", or "In today's..."? Cut it.
- Any "not X, but Y", "not just X but also Y", or "the real question is" construction? State Y directly.
- Any passive voice or "It is believed that"? Find the actor.
- Any false agency like "data tells us", "the decision emerged", or "market rewards"? Name who read, decided, bought, or changed behavior.
- Any rule of three, emoji, bold-label list, or Title Case heading? Flatten it unless the format requires it.
- Any em dash `—` or en dash `–`? The final rewrite fails until those are gone.
- Any fake upbeat ending like "the future looks bright"? Replace it with a concrete next step or stop.

## Reference files

- `references/ai-writing-patterns.md` — comprehensive Humanizer pattern catalog.
- `references/stop-slop-rules.md` — terse hard rules for the final cleanup pass.
