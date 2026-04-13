---
name: mcp-stitch-ui
description: Generate and edit UI screens and design systems using Google Stitch. Use when creating app screens, iterating on mockups, managing Stitch projects, or styling screens. Triggers on "Google Stitch", "Stitch project", "generate UI screen", "edit screen mockup", "design system".
---

# Google Stitch UI

MCP service at `https://stitch.googleapis.com/mcp` (http) with 12 tools.

This skill is configured to send `X-Goog-Api-Key` from the `STITCH_API_KEY` environment variable.

## Requirements

- `mh` CLI must be installed. If not available, install with:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/vaayne/mcphub/main/scripts/install.sh | sh
  ```

## Usage

```bash
# Export your API key first
export STITCH_API_KEY=your_api_key_here

# List tools using the bundled config
mh list -c ./config.json

# Inspect a tool schema
mh inspect -c ./config.json <tool-name>

# Invoke a tool
mh invoke -c ./config.json <tool-name> '{"param": "value"}'

# Direct HTTP fallback if config usage is ever in doubt
mh list -u https://stitch.googleapis.com/mcp -t http \
  --header "X-Goog-Api-Key: $STITCH_API_KEY"
```

## Config

`config.json` is bundled with this skill and injects the required API key header via environment variable expansion:

```json
{
  "mcpServers": {
    "stitch": {
      "transport": "http",
      "url": "https://stitch.googleapis.com/mcp",
      "headers": {
        "X-Goog-Api-Key": "${STITCH_API_KEY}"
      }
    }
  }
}
```

## Notes

- Run `inspect` before invoking unfamiliar tools to get full parameter schema.
- Timeout: 30s default, use `--timeout <seconds>` to adjust.
- This MCP requires `STITCH_API_KEY` to be exported in your shell so `config.json` can populate the `X-Goog-Api-Key` header.
- `generateScreenFromText`, `editScreens`, and `generateVariants` can take a few minutes. Do not retry immediately if the connection drops; the operation may still complete on the server.
- If a generation or edit call times out, **poll instead of retrying** with `listScreens`, `getScreen`, or `getProject` after 20–60 seconds.
- After `createDesignSystem`, call `updateDesignSystem` to apply the design system to the project.
- `generateScreenFromText` may return `output_components` with follow-up suggestions; if the user accepts one, call the tool again with that suggestion as the new prompt.
- Most project and screen identifiers are passed without the `projects/`, `screens/`, or `assets/` prefixes unless the tool explicitly asks for a full resource name.
- Prefer `deviceType` that matches the target surface (`DESKTOP`, `MOBILE`, `TABLET`) so Stitch does not drift into a generic responsive-web layout.
- For redesign work, Stitch performs better when given **concrete UI structure and anti-goals**, not just style adjectives.

## Recommended Workflow

1. Create or find a project with `createProject` or `listProjects`.
2. If redesigning an existing product, first inspect the real app or source material and extract concrete structure, tokens, and anti-patterns.
3. Generate a first screen with `generateScreenFromText`.
4. Inspect the project with `getProject`, `listScreens`, and `getScreen`.
5. If the generation timed out locally, poll before retrying.
6. Refine screens with `editScreens` or `generateVariants`.
7. Create and apply a design system with `createDesignSystem`, `updateDesignSystem`, `listDesignSystems`, and `applyDesignSystem`.

## Prompting Guide

### For net-new concepts

Use prompts that specify:

- product type and device
- primary layout structure
- major components
- design tone
- content to render
- explicit constraints

Example shape:

```text
Create a DESKTOP screen for a repo-management app with a left navigation rail, a grouped sidebar, and a main editor area. Use restrained neutral surfaces, compact typography, and subtle accent color for selection. Include realistic repo names, branch metadata, and activity indicators. Avoid gradients, oversized cards, and marketing-style hero sections.
```

### For redesigns of existing apps

Do not ask Stitch to "make it better" in the abstract. Anchor it to the real product.

Include:

- the actual shell structure
- concrete measurements or component geometry when known
- the app's real visual rules
- what must remain dominant
- what Stitch must avoid

Strong prompt ingredients:

- "three-column shell"
- "36pt circular project avatars"
- "28pt icon boxes"
- "7pt row radius"
- "uppercase 11pt section headers"
- "accent only for selection"
- "dominant terminal pane"
- "avoid oversized cards / gradients / generic SaaS styling"

### Prompt pattern that works well

```text
Design a more faithful redesign of the current [product] app. This must feel like a real native [platform] tool, not a stylish concept dashboard.

Match these concrete characteristics from the current app:
- [shell structure]
- [component geometry]
- [type scale]
- [state styling]
- [what content dominates]

Use [palette/material/typography rules].
Include realistic [data/content].
Avoid [specific anti-goals].
```

## Troubleshooting

### Config errors

If `mh ... -c ./config.json` reports a transport/config validation problem, bypass the config and call Stitch directly:

```bash
mh list -u https://stitch.googleapis.com/mcp -t http \
  --header "X-Goog-Api-Key: $STITCH_API_KEY"
```

Equivalent direct form for invocation:

```bash
mh invoke -u https://stitch.googleapis.com/mcp -t http \
  --header "X-Goog-Api-Key: $STITCH_API_KEY" \
  <tool-name> '{"param":"value"}'
```

### Long-running generations

If `generateScreenFromText` or `editScreens` times out:

1. do **not** immediately retry
2. wait 20–60 seconds
3. check `listScreens`
4. check `getProject`
5. if a screen exists, inspect it with `getScreen`

### Design system drift

Stitch may produce a design system that is more conceptual or brandy than the real app.
When that happens:

- keep the project and screen
- tighten the next prompt around real structure and anti-goals
- prefer screen-level refinement with `editScreens` or a new `generateScreenFromText` pass over vague style-only prompts
- explicitly say what should be flat, compact, divider-based, dense, or dominant

## Tools

| Tool                     | Description                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `createProject`          | Creates a new Stitch project that holds UI designs and generated frontend artifacts.                               |
| `listProjects`           | Lists Stitch projects accessible to the user, optionally filtered to owned or shared projects.                     |
| `getProject`             | Fetches a specific project by full resource name, such as `projects/4044680601076201931`.                          |
| `generateScreenFromText` | Generates a new screen from a natural-language prompt inside a Stitch project.                                     |
| `listScreens`            | Lists screens within a project.                                                                                    |
| `getScreen`              | Fetches a specific screen using project and screen identifiers.                                                    |
| `editScreens`            | Applies prompt-driven edits to one or more existing screens.                                                       |
| `generateVariants`       | Creates multiple prompt-guided variants of one or more existing screens.                                           |
| `createDesignSystem`     | Creates a new project-specific or global design system, including palette, typography, shape, and design guidance. |
| `updateDesignSystem`     | Updates an existing design system and applies the revised tokens to a project.                                     |
| `listDesignSystems`      | Lists design systems available globally or within a specific project.                                              |
| `applyDesignSystem`      | Applies a chosen design system to selected screen instances in a project.                                          |

## Tool Parameters

### `createProject`

```text
Optional:
  title (string)  — title of the new project
```

### `listProjects`

```text
Optional:
  filter (string) — filter such as "view=owned" or "view=shared"
```

### `getProject`

```text
Required:
  name (string)   — full resource name, e.g. "projects/4044680601076201931"
```

### `generateScreenFromText`

```text
Required:
  projectId (string) — project ID without the "projects/" prefix
  prompt (string)    — natural-language description of the screen to generate

Optional:
  deviceType (enum)  — DEVICE_TYPE_UNSPECIFIED | MOBILE | DESKTOP | TABLET | AGNOSTIC
  modelId (enum)     — MODEL_ID_UNSPECIFIED | GEMINI_3_PRO | GEMINI_3_FLASH | GEMINI_3_1_PRO
```

### `listScreens`

```text
Required:
  projectId (string) — project ID without the "projects/" prefix
```

### `getScreen`

```text
Required:
  name (string)      — full resource name, e.g. "projects/{project}/screens/{screen}"
  projectId (string) — project ID without the "projects/" prefix
  screenId (string)  — screen ID without the "screens/" prefix
```

### `editScreens`

```text
Required:
  projectId (string)         — project ID without the "projects/" prefix
  prompt (string)            — edit instruction for the selected screens
  selectedScreenIds (array)  — screen IDs without the "screens/" prefix

Optional:
  deviceType (enum)          — DEVICE_TYPE_UNSPECIFIED | MOBILE | DESKTOP | TABLET | AGNOSTIC
  modelId (enum)             — MODEL_ID_UNSPECIFIED | GEMINI_3_PRO | GEMINI_3_FLASH | GEMINI_3_1_PRO
```

### `generateVariants`

```text
Required:
  projectId (string)         — project ID without the "projects/" prefix
  prompt (string)            — variant-generation instruction
  selectedScreenIds (array)  — screen IDs without the "screens/" prefix
  variantOptions (object)    — variant count, creative range, and focus options

Optional:
  deviceType (enum)          — DEVICE_TYPE_UNSPECIFIED | MOBILE | DESKTOP | TABLET | AGNOSTIC
  modelId (enum)             — MODEL_ID_UNSPECIFIED | GEMINI_3_PRO | GEMINI_3_FLASH | GEMINI_3_1_PRO
```

### `createDesignSystem`

```text
Required:
  designSystem (object) — design system definition

Optional:
  projectId (string)    — project ID; omit to create a global design system
```

### `updateDesignSystem`

```text
Required:
  designSystem (object) — updated design system definition
  name (string)         — full asset resource name, e.g. "assets/15996705518239280238"
  projectId (string)    — project ID without the "projects/" prefix
```

### `listDesignSystems`

```text
Optional:
  projectId (string)    — project ID; omit to list global design systems
```

### `applyDesignSystem`

```text
Required:
  assetId (string)                — design system asset ID without the "assets/" prefix
  projectId (string)              — project ID without the "projects/" prefix
  selectedScreenInstances (array) — screen instances from project info returned by `getProject`
```

## Examples

```bash
# Export your API key once per shell session
export STITCH_API_KEY=your_api_key_here

# Create a project
mh invoke -c ./config.json createProject '{"title": "Meal Planner App"}'

# List owned projects
mh invoke -c ./config.json listProjects '{"filter": "view=owned"}'

# Generate a mobile home screen
mh invoke -c ./config.json generateScreenFromText '{"projectId": "4044680601076201931", "deviceType": "MOBILE", "prompt": "Create a mobile home screen for a meal planner app with weekly plan cards, shopping list preview, and a bottom tab bar. Use compact spacing, realistic content, and avoid oversized marketing cards."}'

# Generate a Mac-native desktop redesign grounded in a real app structure
mh invoke -c ./config.json generateScreenFromText '{"projectId": "4044680601076201931", "deviceType": "DESKTOP", "modelId": "GEMINI_3_1_PRO", "prompt": "Design a more faithful redesign of the current macOS app. This must feel like a real native Mac developer tool, not a stylish concept dashboard. Match these characteristics: three-column shell, narrow project rail, flat grouped sidebar, dense rows, divider-based grouping, dominant terminal/editor pane, accent only for selection, compact SF Pro typography, and semantic runtime colors only for status. Avoid oversized cards, broad glass panels, gradients, and generic SaaS styling."}'

# Edit an existing screen
mh invoke -c ./config.json editScreens '{"projectId": "4044680601076201931", "selectedScreenIds": ["98b50e2ddc9943efb387052637738f61"], "deviceType": "DESKTOP", "prompt": "Make the sidebar flatter and more list-like, tighten row density, restore divider-based grouping, and reduce decorative styling. Keep accent only on selected states."}'

# Poll after a timeout instead of retrying generation
mh invoke -c ./config.json listScreens '{"projectId": "4044680601076201931"}'

# List design systems for a project
mh invoke -c ./config.json listDesignSystems '{"projectId": "4044680601076201931"}'
```
