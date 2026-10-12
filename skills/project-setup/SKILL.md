---
name: project-setup
description: >
  Set up or audit a repository with V's project baseline. Common: an AGENTS.md
  index with .agents/{rules,skills}, mise tools and .mise/tasks, prek, dprint,
  a no-mock test policy with tester-army/e2e, documentation with documd figures
  and Fumadocs, GitHub commit/issue/PR/CI rules, and PostgreSQL with goose.
  Stacks: Go (golangci-lint, sqlc, OpenAPI, embedded React UI), React UI
  (TypeScript 7, Vite+, shadcn on Base UI, Beautiful UI, TanStack Query,
  anti-slop), and TypeScript full stack (TanStack Start, Effect,
  @effect/sql-pg). Use when the user starts a new project, asks to apply "best
  practices" or "项目规范" to a repository, bootstraps AGENTS.md or .agents/, or
  asks which tools and skills a project should use.
---

# Project setup

Apply one baseline to every repository, then add the rules for each stack the
repository uses. The target repository owns the result: it pins its own tool
versions and installs its own skills. This skill only says what to install and
where to get it.

## Modes

- **Setup** applies the baseline to a new repository, or to an existing one
  when the user asks for the change.
- **Audit** reports the differences between the repository and the baseline,
  with file references and a proposed change for each. An audit does not
  install, generate, format, or move files.

State the mode before you start. If the request is not clear, run an audit.

## New and existing repositories

The stack choices in this skill (Vite+, TypeScript 7, TanStack Query, Effect,
golangci-lint, PostgreSQL) are defaults for new projects. In an existing
repository, keep the established stack, package manager, and documentation
layout. Report a stack migration as a proposal; do it only when the user puts
it in scope. Read the ADRs and data-ownership rules before you interpret
leftover configuration.

## Procedure

1. **Inspect.** Read the existing agent instructions, `git status`, and the
   manifests (`package.json`, `go.mod`, `mise.toml`, `prek.toml`, `dprint.json`).
   Identify the stacks. Record any user edits in the working tree and preserve
   them.

   Complete when you know the stacks and which baseline parts already exist.

2. **Lay out instructions.** Follow [layout](references/layout.md). Create the
   root `AGENTS.md` index and the `.agents/rules/` files. Keep existing rules
   that still apply; move them into the matching rule file.

3. **Install the common tooling and rules.** Follow these for every
   repository:
   - [tooling](references/tooling.md): mise and `.mise/tasks`, prek, dprint,
     documd, and e2e.
   - [testing](references/testing.md): test policy, tiers, coverage, and
     enforcement.
   - [documentation](references/documentation.md): document layout, figures,
     and Fumadocs for public docs.
   - [github](references/github.md): commits, issues, PRs, CI, and
     Dependabot.

4. **Apply each stack.** Read only the matching references:
   - Go service: [go](references/go.md).
   - Go service with a web UI: [go](references/go.md),
     [typescript](references/typescript.md), and [web](references/web.md).
   - TypeScript full stack: [typescript](references/typescript.md),
     [web](references/web.md), and [ts-fullstack](references/ts-fullstack.md).
   - The application owns relational data: [database](references/database.md).
     Persistent data alone does not require PostgreSQL; a file store or an
     external system of record may own it.

5. **Install skills.** Install each skill from its upstream source with
   `gh skill install`. Do not copy skill content into this skill or write it
   from memory. See [skill sources](#skill-sources).

6. **Bootstrap.** Run `mise install`, the locked dependency install
   (`mise run install`), `mise run hooks:install`, and the browser install for
   e2e when the repository has one.

7. **Verify.** After an initial setup, run `prek validate-config prek.toml`,
   `mise run format`, and `mise run check`. After an incremental change, run
   the checks for the changed area, and widen them for shared contracts.
   Report each check that you did not run and why.

Before you add a tool, ask if the repository needs it now. Skip parts that do
not apply. For example, do not add PostgreSQL when the application owns no
relational data, do not add e2e to a library without a user interface, and do
not add Fumadocs without public documentation.

## Skill sources

Install skills at project scope into `.agents/skills/`. Resolve the current
release when you install, and commit the installed files. `gh skill update`
uses the source metadata in each `SKILL.md`.

```bash
gh skill install <owner/repo> <skill> --dir .agents/skills
```

| Need                     | Repository                       | Skill                     |
| ------------------------ | -------------------------------- | ------------------------- |
| Diagrams in Markdown     | `markdown-viewer/skills`         | `documd-visuals`          |
| PostgreSQL               | `neondatabase/postgres-skills`   | `postgres-best-practices` |
| End-to-end tests         | `tester-army/e2e`                | `e2e`                     |
| Go code                  | `JetBrains/go-modern-guidelines` | `use-modern-go`           |
| Oxlint anti-slop install | `dmmulroy/anti-slop`             | `install-anti-slop`       |
| shadcn components        | `shadcn/ui`                      | `shadcn`                  |

`install-anti-slop` is a one-time installer. Run it from its upstream copy
during setup; do not keep it in the repository unless the team updates
anti-slop often.
