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
```

## Config

`config.json` is bundled with this skill and injects the required API key header via environment variable expansion:

```json
{
  "mcpServers": {
    "stitch": {
      "baseUrl": "https://stitch.googleapis.com/mcp",
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
- `generateScreenFromText` and `editScreens` can take a few minutes. Do not retry immediately if the connection drops; the operation may still complete.
- After `createDesignSystem`, call `updateDesignSystem` to apply the design system to the project.
- `generateScreenFromText` may return `output_components` with follow-up suggestions; if the user accepts one, call the tool again with that suggestion as the new prompt.
- Most project and screen identifiers are passed without the `projects/`, `screens/`, or `assets/` prefixes unless the tool explicitly asks for a full resource name.

## Recommended Workflow

1. Create or find a project with `createProject` or `listProjects`.
2. Generate a first screen with `generateScreenFromText`.
3. Inspect the project with `getProject`, `listScreens`, and `getScreen`.
4. Refine screens with `editScreens` or `generateVariants`.
5. Create and apply a design system with `createDesignSystem`, `updateDesignSystem`, `listDesignSystems`, and `applyDesignSystem`.

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
mh invoke -c ./config.json generateScreenFromText '{"projectId": "4044680601076201931", "deviceType": "MOBILE", "prompt": "Create a mobile home screen for a meal planner app with weekly plan cards, shopping list preview, and a bottom tab bar."}'

# Edit an existing screen
mh invoke -c ./config.json editScreens '{"projectId": "4044680601076201931", "selectedScreenIds": ["98b50e2ddc9943efb387052637738f61"], "prompt": "Make the hero section more compact, add stronger visual hierarchy, and use a calmer neutral palette."}'

# List design systems for a project
mh invoke -c ./config.json listDesignSystems '{"projectId": "4044680601076201931"}'
```
