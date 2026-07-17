# Diagram input schema

`diagram.json` is a constrained, portable subset of Excalidraw's public
`ExcalidrawElementSkeleton[]` input. The renderer calls
`convertToExcalidrawElements()`; do not generate internal records such as
`seed`, `version`, `nonce`, `updated`, `boundElements`, `groupIds`, `frameId`,
or `points`.

```json
{
  "schemaVersion": 1,
  "title": "Short, useful title",
  "elements": []
}
```

## Supported skeletons

All elements need finite `x` and `y`. Shapes need `width > 0` and `height > 0`;
arrows and lines may use zero or negative dimensions to express direction. `id`
is optional, but nodes referenced by an arrow need unique IDs.

| Type                              | Required extra fields | Typical optional fields                                  |
| --------------------------------- | --------------------- | -------------------------------------------------------- |
| `rectangle`, `ellipse`, `diamond` | `width`, `height`     | `id`, `label: { "text" }`, semantic colors, style fields |
| `text`                            | `text`                | `id`, text style fields                                  |
| `arrow`                           | `width`, `height`     | `id`, `start`, `end`, arrowheads, `label`, style fields  |
| `line`                            | `width`, `height`     | `id`, arrowheads, style fields                           |

Use a labeled shape for a box. Use a standalone `text` element for headings,
annotations, timeline labels, and other content that does not need a container.

## Bound arrows

An arrow can bind to two shape IDs. Both references are validated before HTML is
produced.

```json
{
  "id": "api-to-worker",
  "type": "arrow",
  "x": 330,
  "y": 140,
  "width": 180,
  "height": 0,
  "start": { "id": "api" },
  "end": { "id": "worker" },
  "endArrowhead": "arrow",
  "label": { "text": "enqueue job" }
}
```

Keep the geometry roughly between its endpoints. Excalidraw preserves the
binding while the user moves the connected elements.

## Checked style fields

The renderer accepts these optional, documented values so input errors are
caught before a browser receives them:

| Field                            | Accepted value                            |
| -------------------------------- | ----------------------------------------- |
| `backgroundColor`, `strokeColor` | Non-empty color string                    |
| `fillStyle`                      | `solid`, `hachure`, `cross-hatch`         |
| `strokeStyle`                    | `solid`, `dashed`, `dotted`               |
| `strokeWidth`                    | Positive finite number                    |
| `roughness`                      | Number from 0 to 2                        |
| `opacity`                        | Number from 0 to 100                      |
| `angle`, `fontFamily`            | Finite number                             |
| `fontSize`                       | Positive finite number                    |
| `textAlign`                      | `left`, `center`, `right`                 |
| `verticalAlign`                  | `top`, `middle`, `bottom`                 |
| `startArrowhead`, `endArrowhead` | `null`, `arrow`, `bar`, `dot`, `triangle` |

`label` is an object with a non-empty `text` and may use the text style fields.

## Scope deliberately excluded

Frames and groups are excluded. Their membership behavior relies on generated
Excalidraw state rather than a small, stable skeleton contract. Use a light,
dashed rectangle behind a cluster and a free-text heading instead; list that
background rectangle before its contents in `elements`. Images, embeds,
freedraw, and custom fonts also need files or extra state, so they are excluded.

See [`../examples/system-architecture.json`](../examples/system-architecture.json)
for a complete renderable architecture diagram and
[`design-language.md`](design-language.md) for layout and color guidance.
