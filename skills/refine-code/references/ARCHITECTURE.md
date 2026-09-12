# Architecture

Find structural friction with evidence from callers, responsibilities, ownership, and tests. A small interface is useful when it hides complexity that callers would otherwise manage; a thin module can still enforce a valuable boundary.

## Investigate the actual friction

Trace the relevant call paths and consult domain terminology or ADRs that explain the affected boundaries. Do not load every architecture document or map the whole repository by default.

Look for scattered knowledge, coupled state, repeated coordination across callers, and responsibilities that change together. Read tests to distinguish a difficult interface from missing coverage. Before suggesting a merge, check whether the separation protects ownership, lifecycle, deployment, compatibility, or an independently useful concept.

For each worthwhile candidate, state the involved files, concrete maintenance problem, proposed organization, caller impact, and verification needed. Mention healthy boundaries only when they explain why a tempting change was rejected. If evidence challenges an ADR, name the conflict and why its original rationale may no longer hold.

## Decide and execute within scope

For an assessment, deliver recommendations, including interface sketches when useful. Do not require the user to select a candidate before explaining the solution. For an implementation request, choose the simplest supported approach and carry it through; ask only for a material unresolved decision beyond existing authorization.

- Read [DEEPENING.md](DEEPENING.md) when changing dependency boundaries or relocating tests.
- Read [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md) when plausible alternatives have a meaningful unresolved tradeoff.
- Consult [LANGUAGE.md](LANGUAGE.md) only when terminology needs clarification. Prefer the project's established terms.

Changes to glossaries, ADRs, or comments follow the same authorization boundary as code: propose them during assessment; update relevant documentation when implementing an authorized change. Do not save preferences or decisions to memory without authorization.
