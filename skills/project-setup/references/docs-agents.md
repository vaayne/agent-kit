# docs/AGENTS.md template

Write this file into the target repository as `docs/AGENTS.md` and link it from
the root `AGENTS.md` next to the documentation rule. The root index says which
rule applies to a task; this file says how to write the documents themselves,
so an agent that edits one file under `docs/` reads the whole standard.

Adjust the paths, the examples, and the figure directory to the repository.
Delete a section the repository does not have, and keep the rest.

Standards to name in the file:

| Standard                                                                                      | Use                                          |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [Diátaxis](https://diataxis.fr/)                                                              | One document answers one kind of question    |
| [C4](https://c4model.com/)                                                                    | Figure level: context, container, component  |
| [arc42](https://arc42.org/overview)                                                           | What the architecture documents cover        |
| [ADR, Nygard format](https://adr.github.io/)                                                  | A decision that is hard to reverse           |
| [Google design docs](https://www.industrialempathy.com/posts/design-docs-at-google/)          | Structure of a design document               |
| [Chinese copywriting guidelines](https://github.com/sparanoid/chinese-copywriting-guidelines) | Typography in `README.md`                    |
| Docs as Code                                                                                  | Documents and code change in the same commit |

## Template

````markdown
# Writing docs

Read this file before you change anything under `docs/`.

These standards apply: Diátaxis for the kind of document, C4 for figure level,
arc42 for architecture coverage, the Nygard format for decisions, the Google
design document for proposals, the Chinese copywriting guidelines for
`README.md`, and Docs as Code for the commit.

## Layout

| Path                                         | Type          | Content                                                         |
| -------------------------------------------- | ------------- | --------------------------------------------------------------- |
| `docs/README.md`                             | Index         | Entry point for every document                                  |
| `docs/product.md`                            | Explanation   | Users, scope, non-goals                                         |
| `docs/dev/`                                  | Explanation   | Architecture, development, testing. Entry: `docs/dev/README.md` |
| `docs/ops/`                                  | How-to        | Deploy, roll back, release. Entry: `docs/ops/README.md`         |
| `docs/design/<YYYY-MM-DD>-<topic>/README.md` | Design        | One feature: problem, options, decision, rollout                |
| `docs/adr/<NNNN>-<title>.md`                 | Decision      | Architecture decision record                                    |
| `<figure dir>/src/<name>.puml`               | Figure source | Rendered to `<figure dir>/<name>.png`                           |

Rules:

- Every directory has a `README.md` index: what the directory covers, then each
  document with one sentence.
- Lowercase English and hyphens in file names. No Chinese, no spaces.
- `AGENTS.md` and `CLAUDE.md` are instructions for agents, never document names.
- A directory with more than five documents gets a prefix group such as
  `relay-*.md`, and the index names an entry document for the group.

## Document types

One document answers one kind of question. Do not mix two in one file.

| Type        | Reader's question                       | Shape                                         |
| ----------- | --------------------------------------- | --------------------------------------------- |
| Tutorial    | How do I use this the first time?       | Numbered steps, each one succeeds             |
| How-to      | How do I finish this task?              | Preconditions, numbered steps, how to confirm |
| Reference   | What is this value, field, or endpoint? | Table, complete, no reasoning                 |
| Explanation | Why is it built this way?               | Context, trade-offs, rejected options         |

## Architecture documents

The architecture document describes the system as it is. Cover every area; a
small system may merge the areas into fewer files.

| Area                   | Question                                       | Typical file                       |
| ---------------------- | ---------------------------------------------- | ---------------------------------- |
| Context                | Who talks to the system, where is the boundary | Architecture, product              |
| Containers             | Which processes and stores exist               | Architecture, deployment           |
| Components             | How one process is split                       | The package or module table        |
| Runtime paths          | How a request or job moves                     | The runtime figure and its section |
| Deployment             | Where it runs, how it ships                    | Deployment, release                |
| Cross-cutting concerns | Auth, persistence, isolation, consistency      | Architecture, auth, release        |
| Decisions and risks    | Why, and what was accepted                     | The limits section of each file    |

- Every fact has a source in code or configuration. Mark planned behavior as
  design, or delete the sentence.
- Link source files and named symbols. Do not copy code into a document.
- When a change alters documented behavior, update the document in the same
  commit.
- State the limits: capacity caps, accepted risks, what the project
  deliberately does not do.

## Design documents

Put a design in `docs/design/<YYYY-MM-DD>-<topic>/README.md`, dated the day
writing starts.

1. Status: draft, in review, accepted, implemented, or abandoned, with a date.
2. Background: how it works now, and what the problem is.
3. Goals and non-goals. Non-goals keep the scope from growing.
4. Approach: overall structure first, then detail.
5. Alternatives, and why each was rejected.
6. Risks and limits: what happens on failure, what risk is accepted.
7. Testing and rollout: how to verify, how to ship in steps, how to roll back.
8. Open questions.

Record a version and its change when the design changes. When it ships, fold
what is still true into the architecture document and leave the design as a
record with an updated status.

## ADR

Write an ADR for a decision that is important and hard to reverse.

```markdown
# <NNNN>. <Title>

Status: accepted (YYYY-MM-DD)

## Context

Why this decision is needed, and the constraints.

## Decision

We decided ...

## Consequences

What we gain, what we pay, and when to revisit.
```

Numbers increase and are never reused. Do not edit an accepted ADR. When the
decision changes, write a new ADR and set the old status to superseded by the
new number.

## Figures

One figure answers one question. Choose by question:

| Question                                 | Figure                                                 |
| ---------------------------------------- | ------------------------------------------------------ |
| Which parts exist, in which layers       | Layered architecture figure (C4 context and container) |
| Which components live inside one process | Layered or component figure                            |
| How a request moves                      | Sequence diagram                                       |
| Which states an object has               | State diagram                                          |
| How tables relate                        | ER diagram                                             |
| Where it runs                            | Deployment diagram, or the infrastructure layer        |

- Change the source, then render again. A stale PNG is a wrong document.
- Look at the rendered PNG before you commit. Check overlaps, cut labels, and
  missing names.
- Commit the source and the PNG together.
- Every box has a name. A reader should follow the figure without the text.
- Split a figure at about fifteen boxes into an overview and a detail figure.
- Prefer nesting over arrows. Keep every flow in the text as well, because text
  in an image cannot be searched.
- A layered figure reads top to bottom in no more than six layers. Color marks
  the layer, not the component.

## Writing

- Write English in ASD-STE100 style: short sentences, active voice, one meaning
  per word.
- Write `README.md` in Chinese, following the copywriting guidelines: one idea
  per sentence, a space between Chinese and Latin or digits, full-width
  punctuation.
- Name the actor and the object. A pronoun refers to exactly one thing.
- Use one name for one concept, start to finish. Explain a term the first time
  it appears.
- Put the condition before the action.
- Give a number a unit and a range: "every 5 seconds", "at most 30 seconds". Do
  not write "fast" or "many".
- Do not write "currently", "recently", or "new". Write the date when time
  matters.
- Use backticks for code, paths, field names, task names, and commands.
- Use a table for comparisons, values, and lists. Split a table at about ten
  rows.
- Link with a relative path. When a heading changes, check the links that point
  to it.
- Keep headings to three levels, and write them as nouns, not questions.
- Open each document with one paragraph: what it covers, who reads it, and a
  link back to the directory index.

## Content safety

- Never write a secret, token, password, or connection string, not even a part
  of one. Name the secret or the setting instead.
- Never write customer data or personal data. Use invented accounts in
  examples.
- Do not commit documd preview HTML or temporary figure exports.

## Check before commit

1. The document answers one kind of question, and does not mix a procedure with
   a reference table.
2. Every fact matches the code; planned behavior is marked as design.
3. Every relative link and anchor resolves.
4. Every figure was rendered from its source and looked at.
5. The directory `README.md` lists the new document.
````

## Order of work

When the repository has no `docs/` at all, write `docs/README.md`,
`docs/product.md`, and `docs/dev/` first, then this file. When the repository
already has documents, write this file first and bring the existing files to it
in a later change; report the gap instead of rewriting documents unasked.
