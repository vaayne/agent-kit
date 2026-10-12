# Common tooling

Pin every tool to an exact version. Query the current release when you set up a
repository; do not use versions from memory.

## mise: tools and tasks

`mise.toml` is the only source of tool versions and task commands. Other tools
call `mise run <task>`; they do not copy its commands.

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
`mise tasks`. Put long scripts in `.mise/tasks/<group>/<name>` files instead of
inline strings. Load local secrets with `[env] _.file = ".env"` and commit only
`.env.example`.

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
`npm install -g`. Install the `documd-visuals` skill and link it from
`documentation.md`. Store figure sources next to the documents that use them.

## e2e: end-to-end tests

Use [tester-army/e2e](https://github.com/tester-army/e2e) for user flows in web
and mobile apps. Run `npx e2e init` once, then add the package as a pinned
development dependency. Add a `test:e2e` mise task. Keep model credentials in
`.env`; tests without agent steps need no model. Install the `e2e` skill. The
package ships its documents in `node_modules/e2e/docs`.

Test user-visible behavior with real dependencies. Do not mock modules.
