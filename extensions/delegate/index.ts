import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { registerDelegateCommands } from "./commands.js";
import { formatMissingModelEnvWarning, missingModelEnvProfiles } from "./model-env.js";
import type { PresetConfig } from "./presets.js";
import { discoverPresets } from "./presets.js";
import { registerDelegateTool } from "./tool.js";

function formatPresetList(presets: PresetConfig[]): string {
  return presets.map((preset) => `  ${preset.filePath}`).join("\n");
}

function buildSystemPrompt(presets: PresetConfig[], systemPrompt: string): string {
  const presetsList = presets.map((preset) => `- **${preset.name}**: ${preset.description}`).join("\n");

  return `${systemPrompt}

## Available Presets

The following presets are available for delegation via the \`delegate\` tool:

${presetsList}

Use the delegate tool to delegate tasks to these specialized presets when appropriate.
`;
}

export default function(pi: ExtensionAPI) {
  let discoveredPresets: PresetConfig[] = discoverPresets(path.resolve("."), "both").presets;

  registerDelegateCommands(pi, () => discoveredPresets);
  if (!process.env.PI_DELEGATE) {
    registerDelegateTool(pi);
  }

  pi.on("session_start", async (_event, ctx) => {
    const discovery = discoverPresets(ctx.cwd, "both");
    discoveredPresets = discovery.presets;

    if (process.env.PI_DELEGATE || discoveredPresets.length === 0) return;

    ctx.ui.notify(
      `Found ${discoveredPresets.length} preset(s):\n${formatPresetList(discoveredPresets)}`,
      "info",
    );

    const missingProfiles = missingModelEnvProfiles(discoveredPresets);
    if (missingProfiles.length > 0) {
      ctx.ui.notify(formatMissingModelEnvWarning(missingProfiles), "warning");
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (process.env.PI_DELEGATE || discoveredPresets.length === 0) return;
    return {
      systemPrompt: buildSystemPrompt(discoveredPresets, event.systemPrompt),
    };
  });
}
