# Diagram design language

Use this as a compact design aid, not a substitute for understanding the topic. Color carries
semantic role, geometry carries relationship, and text carries the explanation.

## Semantic palette

| Role                         | Fill      | Stroke / text | Use                                         |
| ---------------------------- | --------- | ------------- | ------------------------------------------- |
| Entry or external actor      | `#d0ebff` | `#1971c2`     | Trigger, user, public caller                |
| Process or neutral component | `#e9ecef` | `#495057`     | Service, action, stable component           |
| Transformation               | `#e5dbff` | `#6741d9`     | Processing or translation step              |
| Decision                     | `#fff3bf` | `#e67700`     | Branch or policy check                      |
| Success or destination       | `#d3f9d8` | `#2b8a3e`     | Result, durable output                      |
| Warning or failure           | `#ffe3e3` | `#c92a2a`     | Rejection, retry, risk                      |
| Boundary                     | `#f8f9fa` | `#868e96`     | Light, dashed enclosing region              |
| Evidence artifact            | `#212529` | `#f8f9fa`     | Small payload, route, method, or event list |

Use a darker stroke or text color with a light fill. Reuse a role color consistently; do not make
color decorative. For free text, use the darker role color for headings and `#495057` for details.

## Geometry that says something

| Relationship                          | Layout                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| One source produces several outcomes  | Fan-out: source centered before targets, arrows radiating outward  |
| Several inputs produce one result     | Convergence: inputs arranged toward a shared destination           |
| Ordered steps or events               | Timeline: line, small markers, labels in sequence                  |
| Feedback or iteration                 | Cycle: directional loop with a clear return edge                   |
| Input becomes output                  | Transformation line: before → operation → after                    |
| Alternatives or trade-offs            | Parallel comparison: matched columns with a visible contrast point |
| Trust, ownership, or phase separation | Boundary: lightly filled background region, title at its edge      |

Use one dominant pattern for the main claim. Mix patterns only when the topic actually changes
relationship type; visual variety for its own sake is noise.

## Containers and evidence

A container earns its border when it represents a thing, boundary, decision, or connection anchor.
Prefer free text for headings, captions, nearby annotations, and hierarchy labels. For a boundary
made from a rectangle, insert it before the enclosed elements so it stays behind them.

For a technical teaching diagram, an evidence artifact may be a small, readable dark rectangle
with a real request field, event sequence, endpoint, method, or code fragment. Keep it short and
connect it to the mechanism it proves. Omit it when it merely repeats the label or makes a
conceptual diagram harder to read.
