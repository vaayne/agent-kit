# TypeScript full stack: TanStack Start

Read this when the backend is TypeScript. Read [typescript](typescript.md) and
[web](web.md) first; they cover the toolchain and the UI.

Stack: [TanStack Start](https://tanstack.com/start) on Vite+, Effect for server
logic, PostgreSQL through `@effect/sql-pg`, and TanStack Query in the UI. Start
owns routing, SSR, and the boundary between browser and server, so the app does
not need a separate API server or an OpenAPI client.

## Setup

- Add `tanstackStart()` from `@tanstack/react-start/plugin/vite` to the
  `plugins` of `vite.config.ts`, before the React plugin. Vite+ provides
  `vite`, so the plugin runs on the Vite+ core.
- Commit `src/routeTree.gen.ts`. Do not edit it by hand, and exclude it from
  lint and format checks.
- Read the upstream guides in the `@tanstack/react-start` documentation before
  you add a feature that they cover, such as authentication, middleware,
  server routes, and environment variables. Do not rely on memory; the API
  changes often.

## Server code

Follow the upstream file convention, so that server code never reaches the
browser bundle:

```
src/features/users/
  users.functions.ts   # createServerFn wrappers; safe to import anywhere
  users.server.ts      # server-only Effect code: queries, services
  users.ts             # client-safe schemas, types, and query options
```

- A server function is the network boundary. Validate its input with an
  Effect Schema, for example `.validator(Schema.decodeUnknownSync(Input))`.
  Declare the schema in the client-safe file, so the UI uses the same type.
- Write the server logic as Effect programs in `.server.ts` files. Model
  expected failures as typed errors, and map each one to a response in the
  server function. Do not throw for expected failures.
- Build the application layer (database, configuration, services) once, in a
  server-only module, with `ManagedRuntime.make(AppLayer)`. Each server
  function handler calls `runtime.runPromise(program)`. Do not build layers
  per request.
- Read configuration with Effect `Config`, and wrap secrets in `Redacted`.
- Use a server route (the `server` option of `createFileRoute`) only for
  endpoints that clients other than this UI call, for example webhooks. Describe such an endpoint with
  OpenAPI when an external client depends on it.

## Data in the UI

Use TanStack Query as described in [web](web.md), with the Start integration:

- Create the `QueryClient` inside `getRouter`, not at module scope. Start
  creates one router for each SSR request, so a module-scoped client can leak
  one user's data into another user's HTML.
- Call `setupRouterSsrQueryIntegration` from `@tanstack/react-router-ssr-query`.
  It supplies the provider and handles SSR hydration. Do not add a second
  provider.
- Define `queryOptions` that call server functions, in the client-safe file.
  Use the same options in the route loader (`ensureQueryData`) and the
  component (`useSuspenseQuery`).
- Put privileged reads in server functions. A route loader can also run in the
  browser.

## Effect

Effect is for server code. Do not use Effect in components; TanStack Query
owns server state in the UI. Enable the anti-slop Effect rules (see
[typescript](typescript.md)).

## Database

Follow [database](database.md): goose migrations and `@effect/sql-pg`.
