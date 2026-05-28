# Grilling Guide

Interrogate the design relentlessly before writing anything down. The goal is shared understanding — walk down each branch of the design tree and resolve dependencies between decisions one by one.

**Ask questions one at a time**, waiting for feedback before continuing. For each question, provide your recommended answer. If a question can be answered by exploring the codebase, explore instead of asking.

## What to do during grilling

**Sharpen fuzzy language.** When the user uses vague or overloaded terms, propose a precise canonical term and ask which they mean: "You're saying 'account' — do you mean the Customer or the User?"

**Surface hidden assumptions.** When a requirement is stated as if obvious, ask what makes it obvious. "Last-writer-wins is fine" — fine in what failure modes? Concurrent edits? Network partitions? Two users hitting save?

**Discuss concrete scenarios.** Stress-test with specific scenarios that force precision about edge cases and boundaries. "What happens if the user closes the tab mid-upload?" beats "what's the error handling story?".

**Cross-reference with code.** When the user states how something works, check whether the code agrees. Surface contradictions: "Your code cancels entire Orders, but you said partial cancellation is possible — which is right?"

**Probe reversibility and blast radius.** For each decision, ask: how hard is this to change later? What else does it lock in? Hard-to-reverse choices deserve more grilling than easy ones.

**Stop when the design is solid — or abandon it.** Grilling ends when you can write a plan whose decisions you can defend, or when interrogation reveals the idea isn't worth pursuing. Either outcome is a success.

## Output

Grilling produces no separate artifact. The output is shared understanding and the resolved decisions that will land in `plan.md`.
