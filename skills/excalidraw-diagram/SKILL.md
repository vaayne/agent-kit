---
name: excalidraw-diagram
description: >
  Create editable Excalidraw-backed HTML diagrams for architecture, system and data flows,
  workflows, protocols, concepts, tradeoffs, and other spatial explanations. Use whenever a
  user asks to diagram, visualize, map, sketch, or draw an architecture or flow, or when a
  text-only explanation would obscure boundaries, dependencies, causality, or direction. Do not
  use it for decorative images or polished slide illustrations.
---

# Excalidraw diagrams

Produce a small, legible, **editable** Excalidraw artifact. It should make a visual claim—not
turn paragraphs into an evenly spaced card grid. Read
[`references/design-language.md`](references/design-language.md) and
[`references/schema.md`](references/schema.md) before authoring.

## Design before JSON

1. Name the audience, question, entities, boundaries, and relationships. State a low-risk
   interpretation when one is needed; ask if the ambiguity changes the diagram's meaning.
2. Assess depth:
   - **Conceptual:** show the mental model with short labels and meaningful geometry.
   - **Technical or teaching:** check primary documentation for actual protocol names, endpoints,
     payload fields, event names, and APIs before drawing. Do not invent plausible terminology.
     Add a concrete artifact—a short payload, route, method name, or event sequence—only when it
     helps the reader learn the mechanism. Cite the source in the response when research shaped
     the diagram.
3. Make a visual plan. Choose a reading direction and a geometry that matches the claim: fan-out,
   convergence, timeline, cycle, boundary, transformation, or comparison. A useful test: if
   labels vanished, would the remaining placement and connections still hint at the relationship?
4. Use the semantic palette and container discipline in the design reference. Boxes represent
   entities, decisions, boundaries, or arrow anchors; titles, annotations, and supporting detail
   should usually be free text. Put a background boundary rectangle _before_ the elements it
   contains so it cannot cover them.

## Create and render

1. Create `diagram.json` with the documented `ExcalidrawElementSkeleton` subset. Give connected
   shapes stable IDs and bind arrows with `start`/`end`. Do not synthesize Excalidraw internal
   records, points, frames, or groups.
2. Create a fresh bundle at:
   ```text
   ~/.agents/sessions/{project}/excalidraw-diagrams/{YYYY-MM-DD}-{diagram-slug}/
   ```
   Render it with:
   ```bash
   node skills/excalidraw-diagram/scripts/render-excalidraw.mjs \
     /path/to/diagram.json /path/to/bundle
   ```
   The renderer writes `diagram.json` and `diagram.html`, and refuses to overwrite either unless
   `--force` is intentional.
3. Run the QA loop: render → open `diagram.html` in a browser → inspect the actual canvas → fix
   the JSON/layout → rerender. Check the visual argument, reading order, label legibility,
   whitespace, boundaries, arrow direction/binding, and unintended crossings or overlaps.

### When visual inspection is unavailable

Do not claim visual QA occurred. If no browser/UI is available, or CDN access prevents loading,
run the renderer and inspect the JSON statically for finite coordinates, positive shape sizes,
background ordering, long labels, and clean arrow endpoints. Report the artifact as **not visually
inspected** and name the remaining risk: browser font metrics, clipping, overlap, and CDN load
failures can only be caught in a real canvas.

## Output contract

Return the bundle path and exactly these artifacts:

```text
{bundle}/
  diagram.json  # canonical, portable skeleton input
  diagram.html  # editable Excalidraw canvas derived from diagram.json
```

`diagram.html` is a static shell, not a self-contained app. Opening it requires network access
to load pinned React 19, Excalidraw 0.18.1, and Excalidraw fonts from CDNs. It retains
Excalidraw's built-in edit and export controls; no npm install, build step, or vendored package is
required.

## Attribution

The concise design-method ideas were independently adapted after consulting the reference noted
in [`references/credits.md`](references/credits.md); no reference JSON templates, renderer, or
prose were copied.
