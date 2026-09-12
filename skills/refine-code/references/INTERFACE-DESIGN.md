# Interface Design

Compare alternatives when they expose a meaningful tradeoff for the requested change. Start from actual callers, constraints, invariants, dependency behavior, and expected changes. Do not invent flexibility or extension use cases just to produce different designs.

Sketch the simplest viable interface first. Compare another approach when it could materially improve caller simplicity, ownership, compatibility, or testability. There is no required number of designs, entry points, or agents.

Each useful design should show the caller experience, what the implementation hides, and its main costs. Include types, ordering, errors, or dependency strategy only as needed to judge that tradeoff. Use [DEEPENING.md](DEEPENING.md) when dependency boundaries are central.

Independent investigation or design work may help with a difficult unresolved choice. Delegate only a bounded task worth its overhead, following the environment's rules; inside bb, use bb parent/child threads. Do not require parallel agents for routine interface changes.

Recommend the strongest design with reasons from the current code and requirements. For assessment, deliver that recommendation. For authorized implementation, proceed unless the remaining choice materially affects scope, safety, supported behavior, or reversibility.
