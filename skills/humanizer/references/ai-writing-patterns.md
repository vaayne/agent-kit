# AI writing patterns

Use this catalog when a text needs a thorough AI-writing cleanup. Do not flag isolated tokens blindly; look for clusters of patterns.

## Content inflation

- **Significance inflation**: stands as, serves as, testament, pivotal, crucial, underscores, highlights, reflects broader trends, marks a shift.
  - Fix: state the concrete fact and why it matters in this case.
- **Notability padding**: vague media lists, active social presence, "leading expert" claims without useful context.
  - Fix: cite one concrete source or cut the claim.
- **Superficial -ing analysis**: highlighting, ensuring, reflecting, contributing, showcasing tacked onto the end of a sentence.
  - Fix: split into factual sentences or remove the fake depth.
- **Promotional language**: vibrant, rich, profound, nestled, breathtaking, must-visit, stunning, groundbreaking.
  - Fix: name observable traits.
- **Vague attribution**: experts argue, observers note, industry reports, several sources.
  - Fix: name the source or say the evidence is unavailable.
- **Formulaic challenges/future sections**: "Despite these challenges... future outlook... continues to thrive".
  - Fix: describe the specific constraint, actor, action, and date.

## Language and grammar tells

- **AI vocabulary clusters**: additionally, align with, delve, enhance, foster, intricate, key, landscape, pivotal, showcase, tapestry, testament, underscore, valuable, vibrant.
  - Fix: simpler verbs and nouns.
- **Copula avoidance**: serves as, stands as, boasts, features, represents when "is" or "has" works.
  - Fix: use is/are/has.
- **Negative parallelisms**: not only...but, not just about...it's, no guessing, no wasted motion.
  - Fix: state the positive claim directly.
- **Rule of three**: forced triples used to sound complete.
  - Fix: use one or two items unless there are truly three.
- **Elegant variation**: synonym cycling to avoid repetition.
  - Fix: repeat the correct term when it keeps meaning clear.
- **False ranges**: from X to Y when X/Y are not a scale.
  - Fix: list the actual topics.
- **Passive voice and subjectless fragments**: mistakes were made, no configuration needed, results are preserved.
  - Fix: name the actor when it improves clarity.

## Style tells

- **Em dash / en dash overuse**: final rewrites should contain no `—` or `–`.
  - Fix: period, comma, colon, parentheses, or restructure.
- **Mechanical boldface**: bolding every key term or list label.
  - Fix: use plain text unless emphasis carries meaning.
- **Inline-header vertical lists**: `- **Performance:** Performance was improved...`.
  - Fix: combine into prose or make labels non-redundant.
- **Title Case headings**: AI often title-cases every heading.
  - Fix: sentence case unless house style says otherwise.
- **Emoji decoration**: rockets, checks, bulbs in headings or bullets.
  - Fix: remove unless the brand voice uses them.
- **Curly quotes**: not a tell alone, but normalize when cleaning pasted model output.

## Communication tells

- **Chatbot residue**: Great question, Certainly, Of course, I hope this helps, let me know, here is an overview.
  - Fix: start with the content.
- **Knowledge-cutoff disclaimers**: as of my last update, based on available information, details are limited.
  - Fix: cite a source, say what is unknown, or cut the guess.
- **Sycophancy**: You're absolutely right, excellent point, great question.
  - Fix: respond to the substance.
- **Signposting**: let's dive in, let's explore, let's break this down, here's what you need to know.
  - Fix: do the thing.
- **Generic positive conclusions**: exciting times lie ahead, future looks bright, journey toward excellence.
  - Fix: give a specific next step or stop.
- **Diff-anchored writing**: docs narrate what changed instead of describing current behavior.
  - Fix: write the document as it should read after the change.

## False positives

Do not flatten real human writing just because it is polished. These are weak signals on their own:

- perfect grammar
- formal vocabulary
- one em dash
- one transition word
- curly quotes
- lack of citations
- clean formatting

Preserve evidence of human voice:

- unusual specifics
- unresolved tension
- era-bound references
- first-person choices the author can defend
- varied sentence length
- real asides or self-corrections
