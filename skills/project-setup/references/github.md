# GitHub

Put the commit, issue, and PR rules in `.agents/rules/workflow.md`. Copy the
templates below into `.github/`.

## Commits

- Format the subject as `<scope>: <description>`. The scope is the area that
  changed (`api`, `web`, `db`, `docs`, `ci`, `treewide`). Do not use
  Conventional Commit types such as `feat:` or `fix:`. Emoji are allowed.
- Write the subject in the imperative, under about 72 characters. Use the body
  for the reason when the diff does not show it.
- Make each commit one logical change that passes `mise run check`. Commit
  formatter output separately from behavior changes.
- Do not amend or force-push unless the user asks. Use
  `git push --force-with-lease`, never `--force`.
- Do not add `Signed-off-by`. Never commit secrets, `.env`, or local reports.

## Writing to GitHub

Creating or editing an issue, a PR, a comment, a release, or a label publishes
content. Do it only when the user asks for it in the current task.

- Use the `gh` CLI. Write the body to a file and pass `--body-file`, so that
  shell quoting cannot change the Markdown.
- Describe the final change, not the conversation that produced it.
- Attach only images that you reviewed, for example screenshots from an e2e
  report. Do not upload local paths, logs with secrets, or private data.
- After a failed or partial write, read the result back (`gh pr view`,
  `gh issue view`) before you retry, so that you do not create a duplicate.

## Issues

Open an issue before the work when the change affects external behavior,
spans several areas, or needs a decision. A small independent fix needs no
issue. Template `.github/ISSUE_TEMPLATE/implementation.md`:

```markdown
---
name: Implementation issue
about: Define a problem, its outcome, and the proposed work.
title: ""
labels: ""
assignees: ""
---

## What

<!-- State the problem, scope, and observable acceptance criteria. For a bug, include the trigger, expected result, actual result, and steps to reproduce. -->

## Why

<!-- Explain who is affected and the consequence. Separate observed facts from assumptions. -->

## How

<!-- Describe the proposed approach, key choices, dependencies, and limits. If the approach is not known, state what must be investigated. -->

## Refs

<!-- Link related issues, design records, source locations, or reviewed evidence. -->
```

Write the acceptance criteria as user scenarios, so that they become the
first tests (see [testing](testing.md)).

## Pull requests

- Work on a branch. Keep one PR to one purpose.
- Link the issue: `Closes #123` when the PR completes it, `Refs #123` for
  partial work, or `No issue: <reason>`.
- List the exact checks you ran and their results. State what you did not
  check and why.
- Update documents and generated contracts in the same PR.

Template `.github/pull_request_template.md`:

```markdown
## What

<!-- Describe the final delivered behavior and scope. Use a before/after example when it helps. -->

## Why

<!-- Explain the concrete problem and its effect. -->

## How

<!-- Explain the approach, key decisions, deliberate limits, and any compatibility or rollout concerns. Describe the final change rather than the conversation history. -->

## Test

<!-- List the exact checks and results, with report links when available. State what was not checked and why. Do not claim a check passed without evidence. -->

## Refs

<!-- Use Closes #123 for a completed issue, Refs #123 for partial work, or No issue: <reason> for a small independent fix. -->

## Checklist

- [ ] The scope and issue references describe the final change.
- [ ] Required checks passed, and remaining risks or unverified areas are stated.
- [ ] Relevant documentation and generated contracts are current, or no update is needed.
```

## CI

CI runs the same mise tasks as the local hook. Do not copy task commands into
the workflow.

```yaml
# .github/workflows/check.yml
name: Check

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<version>
      - uses: jdx/mise-action@<version>
        with:
          install: true
          cache: true
      - run: mise run install
      - run: mise run check
      - run: git diff --check
```

- Add an `e2e` job when the repository has e2e tests. Upload the report as an
  artifact with `if: always()`, and write a short result to
  `$GITHUB_STEP_SUMMARY`.
- Start a PostgreSQL service container for jobs that need the database.
- Pin each action to a version. Keep `permissions` at `contents: read` and
  widen it only per job.
- Store secrets in GitHub environments. Never print them in a step.
- Do not deploy from a push. Use `workflow_dispatch` with a confirmation input
  and a protected environment.

## Dependabot

Add `.github/dependabot.yml` with weekly updates for each ecosystem in the
repository (`gomod`, `npm`, `github-actions`, `docker`). Group minor and patch
updates, and ignore major versions; upgrade those on purpose. Set
`commit-message.prefix` to the scope, so that Dependabot commits follow the
commit format.
