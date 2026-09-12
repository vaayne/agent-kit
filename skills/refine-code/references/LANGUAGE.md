# Architecture vocabulary

These terms clarify an argument; they do not replace the project's vocabulary. Use API, service, component, or boundary when those names are more precise for the reader.

- **Module:** a unit with an interface and implementation, such as a function, class, package, or service.
- **Interface:** what a caller must know, including types, invariants, ordering, errors, configuration, and relevant performance constraints.
- **Depth:** useful behavior behind a manageable interface. Implementation line count does not measure it.
- **Seam:** a point where behavior can be substituted without changing its consumer.
- **Adapter:** a concrete implementation at such a point.
- **Locality:** related knowledge, changes, and fixes concentrate rather than spreading through callers.

An abstraction earns its place when it hides meaningful knowledge, policy, variation, or ownership. Neither a single implementation nor a small body proves it unnecessary. A module may expose different interfaces for different roles; assess their costs and contracts rather than imposing a vocabulary rule.
