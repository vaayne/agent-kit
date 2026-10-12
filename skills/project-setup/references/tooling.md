# Common tooling

Pin every tool to an exact version. Query the current release when you set up a
repository; do not use versions from memory.

## mise: tools and tasks

`mise.toml` is the only source of tool versions. mise tasks are the public
entry point for every command: hooks, CI, documents, and agents call
`mise run <task>` and do not copy its commands. A task can call a script that a
package owns, for example `vp build` or a `package.json` script.

```toml
[tools]
dprint = "<version>"
prek = "<version>"
node = "<version>"
"npm:@markdown-viewer/documd" = "<version>"

[tasks.format]
description = "Format all files"
run = "dprint fmt"

[tasks.check]
description = "Check formatting, lint, types, tests, and builds"
run = [
  "prek validate-config prek.toml",
  "dprint check",
  # add stack checks here, from fastest to slowest
]

[tasks."hooks:install"]
description = "Install the prek-managed pre-commit hook"
run = "prek install"
```

Give every task a `description`, because agents choose tasks from
`mise tasks`.

### Environment and secrets

- Commit `.env.example` with safe placeholder values. Ignore `.env` in
  `.gitignore` and `.dockerignore`.
- Do not load `.env` globally with `[env] _.file`. Load it only in the tasks
  that need it, such as `dev`. Then `check` and the tests do not receive
  provider or production credentials by accident.
- Tests start child processes with an explicit environment, not the full
  parent environment.
- Document where each secret comes from (for example a 1Password item). Do not
  read or print secret values in tasks, logs, or documents.

### File tasks in `.mise/tasks`

Keep only one-line tasks inline in `mise.toml`. Put every task with more than
one command, a condition, or arguments in a file under `.mise/tasks/`. mise
reads this directory by default, so `mise.toml` needs no `includes` entry.

```
.mise/tasks/
  check/        # check:web-dist, check:api-drift
  generate/     # generate:api, generate:sql
  dev/          # dev:server, dev:web
  db/           # db:migrate, db:reset
  test/         # test:unit, test:e2e
  install/      # install:web, install:e2e-browser
  docs/         # docs:figures
```

The path gives the task name: `.mise/tasks/test/e2e` is `test:e2e`. Name tasks
`<group>:<name>` with these groups, so `mise tasks` shows related tasks
together. Make each file executable (`chmod +x`).

```bash
#!/usr/bin/env bash
#MISE description="Run browser flows against a fresh build"
#MISE depends=["install:e2e-browser"]
#MISE dir="web"
set -euo pipefail

vp build
npx e2e run "$@"
```

- Write the `#MISE` lines directly after the shebang. `description` is
  mandatory. Use `dir` instead of `cd`, and `depends` instead of a nested
  `mise run` when the dependency can run first.
- Start each Bash task with `set -euo pipefail`. Pass `"$@"` through when the
  task wraps a command that takes arguments.
- Call tools by name. mise puts the pinned versions on `PATH`; use
  `mise which <tool>` only when a child process needs an absolute path.
- Keep the aggregate tasks (`install`, `format`, `check`, `build`, `dev`) in
  `mise.toml` as lists of other tasks, so one file shows what `check` runs.
  `install` installs project dependencies from the lockfiles; CI runs it
  before `check`.
- Use a TypeScript or Python file task only when Bash becomes hard to read.
  `mise run` puts the pinned runtime on `PATH`, so `#!/usr/bin/env node` uses
  the pinned Node.

## EditorConfig

Add a short `.editorconfig` for editors. The formatters own the final layout.

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[{Makefile,*.go}]
indent_style = tab
```

## prek: Git hooks

```toml
# prek.toml
minimum_prek_version = "<version>"
default_install_hook_types = ["pre-commit"]

[[repos]]
repo = "local"

[[repos.hooks]]
id = "check"
name = "Repository checks"
entry = "mise run check"
language = "system"
pass_filenames = false
always_run = true
```

The hook calls a mise task, so the hook and CI run the same commands. When
`check` becomes too slow for each commit, point the hook at a faster `lint`
task and let CI run `check`.

## dprint: formatting

dprint formats JSON, Markdown, TOML, YAML, Dockerfiles, and HTML. Language
toolchains format their own source: Vite+ formats TypeScript, and `gofmt`
formats Go. Exclude those files and all generated files from dprint, so that
each file has exactly one formatter.

```json
{
  "json": {},
  "markdown": {},
  "toml": {},
  "yaml": {},
  "dockerfile": {},
  "markup": {},
  "excludes": [
    "**/*-lock.json",
    "**/node_modules",
    "**/dist",
    ".agents/skills/**"
  ],
  "plugins": []
}
```

Run `dprint config add <plugin>` to add the current plugin URLs.

## documd: diagrams

Install the official CLI (`@markdown-viewer/documd`) through the mise npm
backend, as shown above. This pins it like every other tool; do not use
`npm install -g`. Install the `documd-visuals` skill. Follow
[documentation](documentation.md) for where figures go and how to render them.

## e2e: end-to-end tests

Use [tester-army/e2e](https://github.com/tester-army/e2e) for user flows in web
and mobile apps. Run `npx e2e init` once, then add the package as a pinned
development dependency. Add a `test:e2e` mise task. Keep model credentials in
`.env`; tests without agent steps need no model. Install the `e2e` skill. The
package ships its documents in `node_modules/e2e/docs`.

Follow [testing](testing.md) for the test policy.
