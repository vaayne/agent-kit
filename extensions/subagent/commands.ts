import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
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

function buildResumeDelegationPrompt(sessionId: string, task: string): string {
	return [
		"Use the `agent` tool to resume a prior subagent session.",
		"",
		"Do not pass the raw slash-command prompt through unchanged.",
		"First rewrite it into a self-contained follow-up prompt that is aware of the current session context, including:",
		"- the current conversation and user goal",
		"- the current repository and working directory",
		"- files already discussed, inspected, or modified",
		"- constraints, preferences, and decisions already established",
		"- the expected output from the resumed subagent",
		"",
		"Keep the rewritten prompt concise, but include enough context for the subagent to continue effectively without seeing the full conversation.",
		"",
		"Then call the `agent` tool with:",
		`{ "sessionId": "${sessionId}", "prompt": "<your rewritten prompt>", "options": { "scope": "both" } }`,
		"",
		"After the tool returns, continue normally and integrate the resumed subagent result into your response.",
		"",
		`Raw slash-command request: ${task}`,
	].join("\n");
}

function buildSwarmDelegationPrompt(task: string): string {
	return [
		"Run a lightweight multi-agent implementation swarm for this task.",
		"",
		"Use the current repository and conversation context. Do not ask for approval unless a genuine ambiguity would cause work contrary to user intent.",
		"",
		"Workflow:",
		"1. Use the `agent` tool with `oracle` to create a concise implementation plan split into multiple phases.",
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
		"- Every subagent prompt must explicitly tell the subagent to read the current handoff file first and update it before finishing.",
		"- Preserve context continuity through the handoff file so the next agent can continue without needing the full prior conversation.",
		"- Keep this lighter than a full specs-driven workflow: concise plan, practical phase breakdown, no extra ceremony.",
		'- Use `options.scope: "both"` for agent calls.',
		"- Integrate results yourself and drive the loop to completion.",
		"",
		`Task: ${task}`,
	].join("\n");
}

function getAvailableAgentsText(
	getDiscoveredAgents: () => AgentConfig[],
): string {
	const names = getDiscoveredAgents().map((agent) => agent.name);
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

			const availableAgents = getDiscoveredAgents();
			const agentExists = availableAgents.some(
				(candidate) => candidate.name === parsed.agent,
			);
			if (!agentExists) {
				ctx.ui.notify(
					`Unknown agent: ${parsed.agent}\nAvailable: ${getAvailableAgentsText(getDiscoveredAgents)}`,
					"error",
				);
				return;
			}

			sendDelegationPrompt(
				pi,
				ctx,
				buildAgentDelegationPrompt(parsed.agent, parsed.task),
			);
		},
	});

	pi.registerCommand("agent-resume", {
		description:
			"Resume a saved subagent session via the main agent: /agent-resume <session-id> <prompt>.",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const firstSpace = trimmed.search(/\s/);
			if (!trimmed || firstSpace === -1) {
				ctx.ui.notify("Usage: /agent-resume <session-id> <prompt>", "warning");
				return;
			}

			const sessionId = trimmed.slice(0, firstSpace).trim();
			const task = trimmed.slice(firstSpace).trim();
			if (!sessionId || !task) {
				ctx.ui.notify("Usage: /agent-resume <session-id> <prompt>", "warning");
				return;
			}

			sendDelegationPrompt(
				pi,
				ctx,
				buildResumeDelegationPrompt(sessionId, task),
			);
		},
	});

	pi.registerCommand("agents-swarm", {
		description:
			"Run a lightweight oracle → worker → reviewer implementation swarm coordinated through a handoff-*.md file.",
		handler: async (args, ctx) => {
			const task = args.trim();
			if (!task) {
				ctx.ui.notify("Usage: /agents-swarm <task>", "warning");
				return;
			}

			sendDelegationPrompt(pi, ctx, buildSwarmDelegationPrompt(task));
		},
	});
}
