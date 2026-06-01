import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { PresetConfig } from "./presets.js";
import { splitPresetTask } from "./utils.js";

function buildPresetDelegationPrompt(presetName: string, task: string): string {
  return [
    `Use the \`delegate\` tool with preset \`${presetName}\`.`,
    "",
    "Do not pass the raw slash-command prompt through unchanged.",
    "First rewrite it into a self-contained delegated prompt that is aware of the current session context, including:",
    "- the current conversation and user goal",
    "- the current repository and working directory",
    "- files already discussed, inspected, or modified",
    "- constraints, preferences, and decisions already established",
    "- the expected output from the delegate preset",
    "",
    "Keep the rewritten prompt concise, but include enough context for the delegate preset to work effectively without seeing the full conversation.",
    "",
    "Then call the `delegate` tool with:",
    "{ \"name\": \""
    + presetName
    + "\", \"prompt\": \"<your rewritten prompt>\", \"options\": { \"scope\": \"both\" } }",
    "",
    "After the tool returns, continue normally and integrate the delegated result into your response.",
    "",
    `Raw slash-command request: ${task}`,
  ].join("\n");
}

function buildResumeDelegationPrompt(sessionId: string, task: string): string {
  return [
    "Use the `delegate` tool to resume a prior delegated session.",
    "",
    "Do not pass the raw slash-command prompt through unchanged.",
    "First rewrite it into a self-contained follow-up prompt that is aware of the current session context, including:",
    "- the current conversation and user goal",
    "- the current repository and working directory",
    "- files already discussed, inspected, or modified",
    "- constraints, preferences, and decisions already established",
    "- the expected output from the resumed delegate preset",
    "",
    "Keep the rewritten prompt concise, but include enough context for the delegate preset to continue effectively without seeing the full conversation.",
    "",
    "Then call the `delegate` tool with:",
    `{ "sessionId": "${sessionId}", "prompt": "<your rewritten prompt>", "options": { "scope": "both" } }`,
    "",
    "After the tool returns, continue normally and integrate the resumed delegated result into your response.",
    "",
    `Raw slash-command request: ${task}`,
  ].join("\n");
}

function buildSwarmDelegationPrompt(task: string): string {
  return [
    "Run a lightweight multi-preset implementation swarm for this task.",
    "",
    "Use the current repository and conversation context. Do not ask for approval unless a genuine ambiguity would cause work contrary to user intent.",
    "",
    "Workflow:",
    "1. Use the `delegate` tool with preset `oracle` to create a concise implementation plan split into multiple phases.",
    "2. Create a handoff file named `handoff-<slug>.md` in the repository root before implementation starts.",
    "3. Record the plan, phase list, assumptions, constraints, and current status in that handoff file.",
    "4. For each phase:",
    "   - use `worker` to implement the phase",
    "   - require the worker to read and update the handoff file with what changed, files touched, tests run, open issues, and next-step context",
    "   - use `reviewer` to review the resulting changes using the updated handoff file as context",
    "   - if reviewer finds issues, fix them before proceeding",
    "   - update the handoff file again with review outcome and final phase status",
    "   - commit the phase with a small focused emoji Conventional Commit message",
    "5. Continue phase-by-phase until the whole task is complete.",
    "6. At the end, update the handoff file with final status, validation performed, remaining follow-ups, and a concise summary.",
    "",
    "Requirements:",
    "- Every delegated prompt must explicitly tell the delegate preset to read the current handoff file first and update it before finishing.",
    "- Preserve context continuity through the handoff file so the next preset can continue without needing the full prior conversation.",
    "- Keep this lighter than a full specs-driven workflow: concise plan, practical phase breakdown, no extra ceremony.",
    "- Use `options.scope: \"both\"` for delegate calls.",
    "- Integrate results yourself and drive the loop to completion.",
    "",
    `Task: ${task}`,
  ].join("\n");
}

function getAvailablePresetsText(getDiscoveredPresets: () => PresetConfig[]): string {
  const names = getDiscoveredPresets().map((preset) => preset.name);
  return names.length > 0 ? names.join(", ") : "none";
}

function sendDelegationPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  message: string,
): void {
  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
    return;
  }

  pi.sendUserMessage(message, { deliverAs: "followUp" });
  ctx.ui.notify("Queued /delegate request as a follow-up", "info");
}

export function registerDelegateCommands(
  pi: ExtensionAPI,
  getDiscoveredPresets: () => PresetConfig[],
): void {
  pi.registerCommand("delegate", {
    description:
      "Delegate via the main agent: /delegate <name> <prompt>. The main agent rewrites the prompt with current context before calling the delegate tool.",
    getArgumentCompletions: (prefix) => {
      const items = getDiscoveredPresets()
        .map((preset) => ({
          value: `${preset.name} `,
          label: `${preset.name} (${preset.source}) — ${preset.description}`,
        }))
        .filter((item) => item.value.startsWith(prefix));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const parsed = splitPresetTask(args);
      if (!parsed?.task) {
        ctx.ui.notify(
          `Usage: /delegate <name> <prompt>\nAvailable: ${getAvailablePresetsText(getDiscoveredPresets)}`,
          "warning",
        );
        return;
      }

      const availablePresets = getDiscoveredPresets();
      const presetExists = availablePresets.some((candidate) => candidate.name === parsed.preset);
      if (!presetExists) {
        ctx.ui.notify(
          `Unknown preset: ${parsed.preset}\nAvailable: ${getAvailablePresetsText(getDiscoveredPresets)}`,
          "error",
        );
        return;
      }

      sendDelegationPrompt(pi, ctx, buildPresetDelegationPrompt(parsed.preset, parsed.task));
    },
  });

  pi.registerCommand("delegate-resume", {
    description: "Resume a saved delegated session via the main agent: /delegate-resume <session-id> <prompt>.",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      const firstSpace = trimmed.search(/\s/);
      if (!trimmed || firstSpace === -1) {
        ctx.ui.notify("Usage: /delegate-resume <session-id> <prompt>", "warning");
        return;
      }

      const sessionId = trimmed.slice(0, firstSpace).trim();
      const task = trimmed.slice(firstSpace).trim();
      if (!sessionId || !task) {
        ctx.ui.notify("Usage: /delegate-resume <session-id> <prompt>", "warning");
        return;
      }

      sendDelegationPrompt(pi, ctx, buildResumeDelegationPrompt(sessionId, task));
    },
  });

  pi.registerCommand("delegate-swarm", {
    description:
      "Run a lightweight oracle → worker → reviewer implementation swarm coordinated through a handoff-*.md file.",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /delegate-swarm <task>", "warning");
        return;
      }

      sendDelegationPrompt(pi, ctx, buildSwarmDelegationPrompt(task));
    },
  });
}
