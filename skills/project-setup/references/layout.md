# Instruction layout

```
AGENTS.md            # short index; links to rules
CLAUDE.md -> AGENTS.md
.agents/
  rules/             # one file per task area
  skills/            # skills installed with gh skill install
.claude/
  skills -> ../.agents/skills
mise.toml            # tools and aggregate tasks (tooling.md)
.mise/tasks/         # file tasks, one directory per group (tooling.md)
.github/             # CI, templates, Dependabot (github.md)
docs/, assets/       # documents and figures (documentation.md)
.local/              # temporary reports; ignored by Git
```

Codex and most other agents read `AGENTS.md` and `.agents/skills/`. Claude Code
reads `CLAUDE.md` and `.claude/skills/`. The two symlinks make both agents read
the same files:

```bash
ln -s AGENTS.md CLAUDE.md
mkdir -p .claude && ln -s ../.agents/skills .claude/skills
```

## Root AGENTS.md

The root file is an index. Each line names a task area and links to one rule
file. An agent reads only the rules that match its task. Keep the file under
about 40 lines; move any detail into a rule file.

```markdown
# Agent instruction index

Read the rules that match the task before acting. If a task spans several
areas, read each matching rule. Do not load all rule files by default.

- Every task, Git commits, issues and PRs: [workflow](.agents/rules/workflow.md).
- Code, dependencies, API contracts and data: [implementation](.agents/rules/implementation.md).
- Database schema, migrations and queries: [database](.agents/rules/database.md).
- Writing or changing tests: [testing](.agents/rules/testing.md).
- Documents, diagrams and public docs: [documentation](.agents/rules/documentation.md).
- Selecting checks or completing work: [verification](.agents/rules/verification.md).
- Production, deployment, releases and paid calls: [operations](.agents/rules/operations.md).

Repository skills live in `.agents/skills/`. Read a skill when a rule links to
it. If a skill conflicts with a rule, the rule wins.
```

Use this layout for new repositories. In an existing repository, keep a
structure that already routes agents to authoritative documents (for example
`docs/dev/`); link to it from the index instead of moving it.

Add an entry only for an area the repository has. Add a stack-specific rule
(for example `web.md` or `go.md`) when that stack has rules beyond the shared
ones.

## Rule files

Start each rule file with one sentence that says when to read it. Write
repository facts and decisions; do not restate general engineering advice that
the agent already follows.

- `workflow.md`: use `mise tasks` and `mise run <task>` instead of hand-written
  commands; where new tasks go (`.mise/tasks/`); hook installation; commits,
  issues, and PRs from [github](github.md).
- `implementation.md`: module ownership, dependency policy, boundaries for
  untrusted data, generated code that must not be edited by hand. A fix
  covers every entry point with the same failure mechanism (search for the
  pattern), and re-checks the callers, saved data, and tests that depend on the
  old meaning. Neighboring cases that the fix does not apply to keep their
  behavior; test one of them, for example another vendor's model.
- `database.md`: migrations are the schema source; how to add a migration and
  regenerate queries. Link `postgres-best-practices`.
- `testing.md`: the policy from [testing](testing.md), with this repository's
  tiers and tasks.
- `documentation.md`: the rules from [documentation](documentation.md).
- `verification.md`: map each changed area to the smallest `mise run` task;
  the e2e task and when to run it; report checks not run.
- `operations.md`: only for deployable services. Which actions need explicit
  user authorization in the current task: production reads and writes,
  deployments, pushes, tags, releases, destructive resets, and tests that cost
  money. Finishing a setup or passing CI does not authorize a deployment. Keep
  offline validation (manifests, image builds) runnable without credentials.
