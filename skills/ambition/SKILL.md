---
name: ambition
metadata:
  source: https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/
description: >
  Raise the level of a task before doing it. A meta skill for any kind of work
  (code, analysis, documents, decisions): it finds the goal behind the goal
  (altitude), the expert-grade version of the work (depth), and the other
  fields that can contribute (range), then proposes 2-3 upgraded versions, each
  with an outside judge, and rewrites the prompt for the one the user picks.
  Use when the user says "ambition", "be more ambitious", "aim higher", "想大一点",
  "提高 level", "格局打开", "这个任务还能怎么做", or asks what a top expert would do
  with a task.
---

# Ambition

Distilled from Felix Rieseberg's _How to be more ambitious: A tutorial for
humans with models_.

Premise: model capability grows faster than the tasks people give it. People
ask for what they believe is possible. This skill finds a higher level of the
same task and lets the user choose it. It changes how deep the thinking goes,
not the type of task.

**This skill proposes; it does not expand scope on its own.** Do not start the
upgraded work until the user picks a version. After the user picks one, that
version is the scope, and the normal rules (simplest approach, no speculative
extras) apply inside it.

## Inputs

Get the task as the user would give it to an agent. If the user's goal, data,
or constraints are not clear, ask one question at a time before you continue.
Read the available context (repository, documents, data) first, so the
proposals use real sources and tools, not generic ones.

## Three directions

Look at the task in each direction. Skip a direction that adds nothing, and
say why.

### Altitude: the goal behind the goal

Ask "what does the user want to happen next?" Move from the task to the
outcome it serves, one level at a time. Example: "fix this crash" → "keep the
app free of crashes" → "find crashes before users report them".

- At each level, name what the agent needs to close the loop without a human:
  data access, tools, machines, permissions, MCP connectors. A higher goal
  without these is a wish. List the missing parts as setup steps.
- Altitude helps most for outcome work. A signal: without the agent, people
  would hold meetings about this task.
- Stop at the level the current model and setup can reach. "Go make money" is
  too high.

### Depth: the expert version, not the bigger version

Answer these four questions before you rewrite the task:

1. What would a top professional do here that the user did not ask for?
2. What is the rawest source material they would start from, instead of
   summaries and pre-processed inputs?
3. Which specific methods and tools would they use? Use the tools, not only
   the words: a database and a statistical model, not a Markdown table; a
   profiler and a benchmark, not a guess.
4. What, other than the user or the model, would show that the result is
   correct?

Then apply these moves where they fit:

- **Set a hard target.** If the user needs 5 s instead of 10 s, propose
  200 ms, and say what it would take.
- **Test the beliefs.** Turn each assumption in the task into a check against
  raw data. Example: "We believe churn is an onboarding problem. Try to
  reproduce that from the raw data."
- **Produce new knowledge.** Ask what nobody has measured yet: a hidden
  signal, a simulation that reproduces past data, a prediction checked on
  held-out data.

### Range: other fields

- **Replace nouns with verbs.** A QBR is not "a deck"; it is "persuade busy
  people of a cause and effect story and get a decision under uncertainty in
  30 minutes". The verbs show which fields can contribute.
- **Assemble the crew.** Ask which specialists the best possible result would
  need: an analyst, an editor, a designer, a red team such as a short seller
  or a forensic accountant.
- **Use the crew to find methods, not roles.** Do not role-play "write like a
  short seller". Do what a short seller does: the research steps, the data,
  the tools. Parallel agents or subagents can each run one method.

## Outside judge

Every proposal must have a judge that the model does not control: a test
suite, a benchmark, a backtest on held-out data, a real user flow, a tool the
agent can run for fast feedback. The model does not grade its own work. If no
judge exists, building one is part of the proposal.

## Output

Write in the user's language. Keep it short enough to decide from.

1. **Diagnosis.** One or two lines for each direction: what the task is now
   and what the higher level is.
2. **Proposals.** 2–3 versions, from the smallest raise to the most ambitious.
   For each one: the goal, the raw sources and methods, the outside judge,
   the missing setup, and the cost compared with the original task.
3. **Recommendation.** Pick one version and say why.
4. **Rewritten prompt** for the recommended version, ready to paste or run.
   It names the goal, the sources, the methods, the judge, and the stop
   condition.

Then stop and let the user choose.
