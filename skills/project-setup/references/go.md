# Go

Pin Go and golangci-lint in `mise.toml`. Install other Go tools through the
mise `go:` backend so that they also have exact versions:

```toml
[tools]
go = "<version>"
golangci-lint = "<version>"
```

Install the `use-modern-go` skill from `JetBrains/go-modern-guidelines` and
link it from `implementation.md`.

Add these entries to `mise run check`: `golangci-lint fmt --diff`,
`golangci-lint run`, `go test ./...`, and `go build ./...`. golangci-lint runs
`go vet` through the `govet` linter, so do not run `go vet` separately. A
service with a database also follows [database](database.md).

## golangci-lint

Use the v2 configuration format. Start from the `standard` set and enable the
linters below. Run `golangci-lint config verify` after each change.

```yaml
# .golangci.yml
version: "2"
linters:
  default: standard # errcheck, govet, ineffassign, staticcheck, unused
  enable:
    - bodyclose # HTTP response bodies are closed
    - contextcheck # functions pass on the context they receive
    - errname # error types end in Error, sentinels start with Err
    - errorlint # errors.Is/As instead of == and type assertions
    - exhaustive # switch statements cover every enum value
    - forcetypeassert # type assertions check ok
    - gocritic
    - gosec
    - misspell
    - modernize # newer standard library idioms
    - nilerr # no nil return after a non-nil error check
    - noctx # HTTP and SQL calls take a context
    - revive
    - rowserrcheck # rows.Err is checked
    - sqlclosecheck # rows and statements are closed
    - unconvert
    - unparam
    - usestdlibvars # http.MethodGet instead of "GET"
  exclusions:
    generated: strict # skips sqlc and other generated code
    presets:
      - comments
      - std-error-handling
    rules:
      - path: _test\.go
        linters: [gosec, forcetypeassert]
formatters:
  enable:
    - gofmt
    - goimports
```

When a linter reports a false positive, disable it on that line with
`//nolint:<linter> // <reason>`. Do not disable a linter for the whole
repository only to make an existing code base pass. Fix the code, or record the
exclusion and its reason in `.golangci.yml`.

## Web UI

When a Go service has a web UI, put the UI in `web/` as a Vite+ project and
follow [typescript](typescript.md) and [web](web.md). The UI is plain React
with TanStack Query; it needs no TanStack Start and no Effect. The Go binary embeds the built UI, so one
binary serves both the API and the UI.

```
api/
  openapi.yaml                       # API contract, the single source
  oapi-codegen.yaml                  # Go generator configuration
internal/api/server.gen.go           # generated Go server interface and models
web/
  package.json, vite.config.ts, src/ # Vite+ project
  openapi-ts.config.ts               # TypeScript client configuration
  src/api/generated/                 # generated TypeScript client
  dist/                              # build output, committed
  embed.go                           # package web: //go:embed dist/...
```

- **Embed.** Embed named build files, for example
  `//go:embed dist/index.html dist/assets/*`. A missing build then fails
  `go build`, and a binary never ships an empty UI.
- **Commit `web/dist`.** Then `go build`, `go test`, and golangci-lint work in a
  new checkout without Node. Add a `check:web-dist` task: build into a
  temporary directory and `diff -r` it with `web/dist`. Exclude `web/dist` from
  dprint, Oxfmt, and Oxlint. Stop committing `web/dist` only when its diffs
  become too noisy for review; then make every Go task depend on `build:web`.
- **Routes.** Serve the API under `/api/`. Answer unknown `/api/` paths with a
  JSON 404. Answer every other unknown path with `index.html`, so that client
  routes still work after a reload.
- **Development.** Run the Go server and `vp dev` together in `mise run dev`.
  Proxy `/api` from the Vite dev server to the Go server in `vite.config.ts`,
  so the browser uses one origin, as in production.
- **Build.** `mise run build` runs `generate:api`, `vp build`, then `go build`.

## API contract: OpenAPI

`api/openapi.yaml` is the single source of the HTTP API. The Go server and the
TypeScript client are both generated from it, so most contract changes fail
the type check on one side or both. Change the spec first, then regenerate,
then change the handlers and the callers.

Go server, with [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen) on
the standard `net/http` router:

```toml
# mise.toml
[tools]
"go:github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen" = "<version>"
```

```yaml
# api/oapi-codegen.yaml
package: api
output: internal/api/server.gen.go
generate:
  models: true
  std-http-server: true
  strict-server: true
```

`strict-server` gives each operation typed request and response objects, so a
handler cannot return an undeclared response type. The types do not validate
the request on the wire, and they do not check authentication. Validate
untrusted input at the handler boundary (or with the oapi-codegen request
validation middleware), and test the HTTP contract with real requests.

TypeScript client, with [@hey-api/openapi-ts](https://heyapi.dev) as a pinned
development dependency in `web/`:

```ts
// web/openapi-ts.config.ts
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../api/openapi.yaml",
  output: "src/api/generated",
  plugins: ["@hey-api/client-fetch", "@tanstack/react-query"],
});
```

The `@tanstack/react-query` plugin generates query and mutation options for
each operation in `src/api/generated/@tanstack/react-query.gen.ts`. UI code
passes them to TanStack Query, for example `useQuery(getHealthOptions())`. Do
not write `fetch` calls to `/api/` by hand. Keep the `/api` prefix in the spec paths, so the generated
client calls the same origin and needs no base URL.

`@hey-api/openapi-ts` imports the TypeScript JavaScript API, which TypeScript
7.0 does not have. Install TypeScript 6 next to TypeScript 7, as
[typescript](typescript.md) describes.

Tasks:

- `generate:api` runs `oapi-codegen -config api/oapi-codegen.yaml
  api/openapi.yaml`, then `openapi-ts` in `web/`.
- `check:api-drift` generates both outputs into a temporary directory and
  compares them with the committed files. Format the TypeScript output with
  the project formatter before the comparison.
- Commit the generated code. Do not edit it by hand. Exclude it from dprint,
  Oxfmt, Oxlint, and golangci-lint (`generated: strict` already skips the Go
  file).
