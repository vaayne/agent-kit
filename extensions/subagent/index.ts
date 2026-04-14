import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";
import { discoverAgents } from "./agents.js";
import {
	registerAgentCommandRenderer,
	registerAgentCommands,
} from "./commands.js";
import { registerAgentTool } from "./tool.js";

function formatAgentList(agents: AgentConfig[]): string {
	return agents.map((agent) => `  ${agent.filePath}`).join("\n");
}

function buildSystemPrompt(
	agents: AgentConfig[],
	systemPrompt: string,
): string {
	const agentsList = agents
		.map((agent) => `- **${agent.name}**: ${agent.description}`)
		.join("\n");

	return `${systemPrompt}

## Available Agents

The following agents are available for delegation via the \`agent\` tool:

${agentsList}

Use the agent tool to delegate tasks to these specialized agents when appropriate.
`;
}

export default function (pi: ExtensionAPI) {
	let discoveredAgents: AgentConfig[] = discoverAgents(
		path.resolve("."),
		"both",
	).agents;

	registerAgentCommandRenderer(pi);
	registerAgentCommands(pi, () => discoveredAgents);
	registerAgentTool(pi);

	pi.on("session_start", async (_event, ctx) => {
		const discovery = discoverAgents(ctx.cwd, "both");
		discoveredAgents = discovery.agents;

		if (discoveredAgents.length === 0) return;

		ctx.ui.notify(
			`Found ${discoveredAgents.length} agent(s):\n${formatAgentList(discoveredAgents)}`,
			"info",
		);
	});

	pi.on("before_agent_start", async (event) => {
		if (discoveredAgents.length === 0) return;
		return {
			systemPrompt: buildSystemPrompt(discoveredAgents, event.systemPrompt),
		};
	});
}
