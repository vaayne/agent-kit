import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AgentConfig } from "./agents.js";
import { discoverAgents } from "./agents.js";
import {
	registerSubagentCommandRenderer,
	registerSubagentCommands,
} from "./commands.js";
import { registerSubagentTool } from "./tool.js";

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

## Available Subagents

The following subagents are available for delegation via the \`subagent\` tool:

${agentsList}

Use the subagent tool to delegate tasks to these specialized agents when appropriate.
`;
}

export default function (pi: ExtensionAPI) {
	let discoveredAgents: AgentConfig[] = discoverAgents(
		path.resolve("."),
		"both",
	).agents;

	registerSubagentCommandRenderer(pi);
	registerSubagentCommands(pi, () => discoveredAgents);
	registerSubagentTool(pi);

	pi.on("session_start", async (_event, ctx) => {
		const discovery = discoverAgents(ctx.cwd, "both");
		discoveredAgents = discovery.agents;

		if (discoveredAgents.length === 0) return;

		ctx.ui.notify(
			`Found ${discoveredAgents.length} subagent(s):\n${formatAgentList(discoveredAgents)}`,
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
