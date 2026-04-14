import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";
import { splitAgentTask } from "./utils.js";

function buildAgentDelegationPrompt(agentName: string, task: string): string {
  return [
    `Use the \`agent\` tool with agent \`${agentName}\`.`,
    "",
    "Do not pass the raw slash-command prompt through unchanged.",
    "First rewrite it into a self-contained subagent prompt that is aware of the current session context, including:",
    "- the current conversation and user goal",
    "- the current repository and working directory",
    "- files already discussed, inspected, or modified",
    "- constraints, preferences, and decisions already established",
    "- the expected output from the subagent",
    "",
    "Keep the rewritten prompt concise, but include enough context for the subagent to work effectively without seeing the full conversation.",
    "",
    "Then call the `agent` tool with:",
    '{ "name": "' +
      agentName +
      '", "prompt": "<your rewritten prompt>", "options": { "scope": "both" } }',
    "",
    "After the tool returns, continue normally and integrate the subagent result into your response.",
    "",
    `Raw slash-command request: ${task}`,
  ].join("\n");
}

function getAvailableAgentsText(getDiscoveredAgents: () => AgentConfig[]): string {
  return (
    getDiscoveredAgents()
      .map((agent) => agent.name)
      .join(", ") || "none"
  );
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
  ctx.ui.notify("Queued /agent request as a follow-up", "info");
}

export function registerAgentCommands(
  pi: ExtensionAPI,
  getDiscoveredAgents: () => AgentConfig[],
): void {
  pi.registerCommand("agent", {
    description:
      "Delegate via the main agent: /agent <name> <prompt>. The main agent rewrites the prompt with current context before calling the agent tool.",
    getArgumentCompletions: (prefix) => {
      const items = getDiscoveredAgents()
        .map((agent) => ({
          value: `${agent.name} `,
          label: `${agent.name} (${agent.source}) — ${agent.description}`,
        }))
        .filter((item) => item.value.startsWith(prefix));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const parsed = splitAgentTask(args);
      if (!parsed?.task) {
        ctx.ui.notify(
          `Usage: /agent <name> <prompt>\nAvailable: ${getAvailableAgentsText(getDiscoveredAgents)}`,
          "warning",
        );
        return;
      }

      const agent = getDiscoveredAgents().find((candidate) => candidate.name === parsed.agent);
      if (!agent) {
        ctx.ui.notify(
          `Unknown agent: ${parsed.agent}\nAvailable: ${getAvailableAgentsText(getDiscoveredAgents)}`,
          "error",
        );
        return;
      }

      sendDelegationPrompt(pi, ctx, buildAgentDelegationPrompt(parsed.agent, parsed.task));
    },
  });
}
