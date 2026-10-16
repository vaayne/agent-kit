# Testing

Copy these rules into `.agents/rules/testing.md` and link the file from the
root `AGENTS.md`. Adapt the tiers and task names to the repository; keep the
policy.

## Policy

- **Test behavior.** A test states what a user or a caller observes. It does
  not assert private functions, call order, or internal state. A refactor that
  keeps the behavior must not break a test.
- **Scenario first.** Before you implement a user-visible change, write the
  acceptance scenario. Name it from the user view, starting with `user`, and
  write the body as Given / When / Then:

  ```ts
  test("user sees an error when the API key is revoked", async () => {
    // Given a project with a revoked API key
    // When the user sends a chat request with that key
    // Then the response is 401 and the body names the revoked key
  });
  ```

  The scenario must fail before the change and pass after it. A bug fix starts
  with a test that reproduces the bug.
- **Prove the regression test.** Keep the new test, remove the fix, and run
  the test. It must fail with an assertion about the target behavior. A
  compile error or a skipped test does not count. Put the command and the
  failure in the PR, then restore the fix and run the test again.
- **Real inputs.** Build fixtures from the literal input in the report (the
  request, the file, the model output), with private data removed. Do not
  invent a similar sample. Test through the entry point that the user used
  (UI, CLI, API) with their configuration. For a platform-specific bug, run
  the test on that platform. When the evidence comes from a cross-compile, a
  different entry point, or a fake, state what it does not prove.
- **No mocks.** Use real dependencies: a real PostgreSQL database, a real HTTP
  server, a real browser. Do not mock modules, patch imports, or stub methods
  on objects you own.
- **Fakes only at system boundaries.** When a third-party service cannot run in
  tests (payment, email, a model provider), write a fake that implements the
  same interface. Run one contract test suite against the fake and, on
  demand, against the real service. A fake that passes no contract test is a
  mock.
- **Controlled time.** Inject a clock. Do not read wall time in code under
  test. Do not use fixed sleeps; poll the observable condition with a deadline,
  and fail with the last observed state.
- **Isolation.** Each test creates its own data and does not depend on test
  order. Tests that share a database use a unique schema or database per
  test file, or a transaction that rolls back. A test that can read user
  configuration runs with a temporary `HOME` and temporary application and
  platform config directories; it never touches the real ones.
- **Clean ends.** A test stops or waits for every process, goroutine, timer,
  and background task that it starts before it returns. Otherwise the work
  leaks into the next test.

## Failures on main

A test that fails on `main` is a bug to fix now. "It fails the same on main"
is not a baseline, and neither is "it passes alone".

- Record the `main` commit you tested and the failure output.
- Fix the cause in a separate commit, or, with the user's authorization, open
  an issue that names the cause. Do not report the failing check as passed.
- Before you call a test flaky, run it many times under load. For Go, use
  `go test -race -count=20 -run <Test>`. Reproduce a timing failure by
  injecting the delay (a held lock, a late reply) instead of rerunning until
  it fails. Many passing runs do not prove that the bug is absent.

## Tiers

| Tier        | Scope                                   | Task            | When                   |
| ----------- | --------------------------------------- | --------------- | ---------------------- |
| Unit        | Pure logic with many cases, no I/O      | `test:unit`     | Every commit           |
| Integration | One service with its database and HTTP  | `test:int`      | Every commit           |
| E2E         | User flows through the built app        | `test:e2e`      | Every PR and in CI     |
| Contract    | Fakes against the real external service | `test:contract` | On demand, with access |

Prefer the highest tier that stays fast and deterministic. Write unit tests
only for logic with many edge cases, such as parsers and pricing rules. Data
and API boundaries get integration tests. User flows get e2e tests with
tester-army/e2e.

Use golden files for complex output from real data (rendered documents,
generated SQL, API responses). Update a golden file only on purpose, with a
flag such as `UPDATE_GOLDEN=1`, and review its diff.

## Coverage

Measure branch coverage where the tool supports it. Statement coverage is not
branch coverage. Set the target at 90% branch coverage for business code.

- TypeScript: enforce it with `coverage.thresholds.branches` in the Vitest
  section of `vite.config.ts`.
- Go: `go test -coverprofile` measures statements only. Enforce a statement
  threshold as a floor, and review untested branches in the diff.

Record in `testing.md` the scope (which packages count), the tool, the
exclusions, and whether a gate enforces the target. Do not report a target as
enforced when no gate exists. A test without a meaningful assertion does not
count, even when it raises the number.

## E2E completion

A successful runner exit alone does not prove the flows ran. An e2e task
passes only when:

- Each test creates its own fixtures and removes them in teardown.
- The run selected the expected tests and skipped none of them. The runner
  fails on zero selected tests or on a skipped selected test.
- The report records the Git revision, the build that was tested, and the
  command.
- A failure leaves traces, screenshots, and the report in a known directory,
  and the failure message names the scenario and that directory.

State what the e2e run does not prove, for example flows that use a fake
upstream instead of the real provider.

## Enforcement

Make the policy a check, so an agent cannot skip it:

- TypeScript: the anti-slop `no-module-mocking` rule rejects `vi.mock` and
  similar calls. Oxlint `no-restricted-imports` rejects mock libraries.
- Go: add a `check:testpolicy` task that fails when a `_test.go` file imports a
  mock library (`github.com/stretchr/testify/mock`, `go.uber.org/mock`,
  `github.com/golang/mock`). A short Go program under `tools/testpolicy/` or a
  `grep` in the task file is enough.
- Run `check:testpolicy` and the coverage check from `mise run check`.
- When a review finds the same kind of problem twice, add a lint rule or a
  `check:*` task for it, so the next change cannot repeat it.

## Reporting

When you finish a change, list each test task you ran and its result. Name
each check that you did not run and the reason. Do not report a check as
passed without its output.
