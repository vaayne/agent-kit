# Database

Use PostgreSQL for persistent relational data. Install the
`postgres-best-practices` skill from `neondatabase/postgres-skills` and link it
from `.agents/rules/database.md`.

## Local and test databases

- Run PostgreSQL locally with Docker Compose or a mise task. Pin the image to
  the same major version as production. Do not depend on a shared developer
  database.
- Read the connection string from `DATABASE_URL`. Put a local value in
  `.env.example`, and keep real credentials out of Git.
- Test queries and migrations against a real PostgreSQL instance, not a mock.
  Give each test run its own database or schema, and drop it after the run.

Goose owns migrations for every stack: it is a single binary, and its
migrations are plain SQL files. The query layer depends on the backend language:

| Backend    | Migrations | Queries                            |
| ---------- | ---------- | ---------------------------------- |
| Go         | goose      | sqlc and `pgx/v5`                  |
| TypeScript | goose      | `@effect/sql-pg` and Effect Schema |

Do not use an ORM schema (for example Drizzle) as a second schema source.
`@effect/sql-drizzle` supports only Effect 3, and the stack uses Effect 4.

## Migrations: goose

Goose migrations are the single source of the schema. Every other tool reads
the schema from them.

```toml
# mise.toml
[tools]
"aqua:pressly/goose" = "<version>" # prebuilt; a TypeScript project needs no Go
```

- Keep migrations in `internal/db/migrations/` as plain SQL files with
  `-- +goose Up` and `-- +goose Down` sections.
- Create a migration with `goose -dir internal/db/migrations create <name> sql`.
- Do not edit a migration after it is applied to a shared database. Add a new
  migration instead.
- Add `db:migrate` and `db:status` mise tasks. Run migrations as an explicit
  deploy step, so that a server start never changes the schema.
- Add a check that applies all migrations to an empty database, rolls them
  back, and applies them again. This proves that each `Down` section works.

## Go queries: sqlc

Write SQL by hand and generate typed Go code with sqlc. sqlc reads the goose
migrations to build its catalog, so the schema exists in one place.

```toml
# mise.toml
[tools]
"aqua:sqlc-dev/sqlc" = "<version>"
```

```yaml
# sqlc.yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/db/queries/*.sql"
    schema: "internal/db/migrations"
    gen:
      go:
        package: "sqlc"
        out: "internal/db/sqlc"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
```

- Write queries in `internal/db/queries/`. Run `sqlc generate` through a
  `generate:db` mise task.
- Commit the generated code. Do not edit it by hand.
- Add `check:db-drift`: generate into a temporary copy and compare it with
  `internal/db/sqlc` with `diff -r`, so added and deleted files also fail.
  Also run `sqlc vet`. Run the task from `check`.
- Use `pgx/v5` for the driver and the connection pool (`pgxpool`).
- Add `overrides` in `sqlc.yaml` only when the default type is wrong for the
  callers, for example `jsonb` to `json.RawMessage`.

## TypeScript queries: `@effect/sql-pg`

`@effect/sql-pg` is the Effect SQL client for PostgreSQL. It has a native
wire-protocol driver, so the app does not need `pg` or `postgres`. Write SQL by
hand with the `sql` tagged template; it sends values as parameters.

- Provide the client with `PgClient.layerConfig`, and read the URL from
  `Config.redacted("DATABASE_URL")`. Include the layer in the application
  layer, so the pool opens once.
- Decode every result with Effect Schema, through the helpers in
  `effect/sql/SqlSchema` (`findAll`, `findOne`, `findOneOption`). Declare one
  schema per query result next to the query in a `.server.ts` file.
- Nothing generates these schemas from the migrations, so the compiler does
  not detect a mismatch with the tables. Cover each query with a test against a
  real PostgreSQL instance that has all migrations applied.
- Use `sql.withTransaction` for statements that must succeed or fail together.
- Do not use the `@effect/sql-pg` migrator; goose owns migrations.
