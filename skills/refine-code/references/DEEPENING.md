# Deepening

Consolidate responsibilities when this hides shared knowledge and simplifies actual callers. Dependency type informs the approach; it does not decide whether modules should merge.

## Dependencies and boundaries

- **In-process computation:** direct composition often suffices. Preserve independent concepts and ownership even when there is no I/O.
- **Local dependencies:** use existing test infrastructure when it faithfully exercises the contract. A stand-in's availability is not proof that a merge is beneficial or its behavior matches production.
- **Owned remote services:** preserve network failures, versioning, and deployment boundaries. Introduce a port or adapter only when it isolates meaningful transport policy or provides a necessary substitution point.
- **External services:** prefer established clients and integration patterns. Mocks can exercise local decisions; they do not prove the external contract, so retain appropriate contract or integration checks.

One implementation can justify a boundary for ownership, security, lifecycle, or a stable external contract. Multiple implementations alone do not justify one. Name the knowledge or variation the abstraction hides instead of counting adapters. Keep test-only seams internal unless callers also need them.

## Preserve meaningful verification

Test observable behavior through the narrowest stable interface that exercises it. A focused unit test and a broader integration test may cover different failure modes and both earn their keep.

Before removing an old test, identify its cases and assertions. Delete or migrate it only if the behavior is intentionally removed or the surviving checks cover the same needed contract, including edge cases. Do not infer redundancy merely because new interface-level tests exist.

A refactor may legitimately change test setup or an internal interface. Review what each assertion protects; test edits alone do not prove that the old tests were wrong. Preserve checks of ordering, failures, ownership, and compatibility that remain relevant.
