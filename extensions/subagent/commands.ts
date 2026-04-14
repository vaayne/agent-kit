import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { type AgentConfig, discoverAgents } from "./agents.js";
import { runSingleAgent } from "./runner.js";
import type {
	AgentCommandResultDetails,
	SingleResult,
	SubagentDetails,
} from "./types.js";
import {
	formatAgentCommandName,
	formatUsageStats,
	getDisplayItems,
	getResultOutput,
	isCommandSafeAgentName,
	splitAgentTask,
	truncateText,
} from "./utils.js";

interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		confirm: (title: string, message: string) => Promise<boolean>;
		notify: (
			message: string,
			level: "info" | "success" | "warning" | "error",
		) => void;
		setStatus?: (key: string, value: string | undefined) => void;
		setWidget?: (
			key: string,
			value: string[] | undefined,
			options?: { placement?: "aboveEditor" | "belowEditor" },
		) => void;
	};
}

function createCommandDetails(
	projectAgentsDir: string | null,
	results: SingleResult[],
): SubagentDetails {
	return {
		mode: "single",
		agentScope: "both",
		projectAgentsDir,
		results,
	};
}

async function confirmProjectAgentIfNeeded(
	ctx: CommandContext,
	agent: AgentConfig,
	projectAgentsDir: string | null,
): Promise<boolean> {
	if (agent.source !== "project" || !ctx.hasUI) return true;
	return await ctx.ui.confirm(
		"Run project-local agent?",
		`Agent: ${agent.name}\nSource: ${projectAgentsDir ?? "(unknown)"}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
	);
}

function renderProgressLines(result: SingleResult): string[] {
	const lines = [
		`${formatAgentCommandName(result.agent)} running…`,
		`Task: ${truncateText(result.task, 160)}`,
	];
	const displayItems = getDisplayItems(result.messages).slice(-8);

	for (const item of displayItems) {
		if (item.type === "toolCall") {
			lines.push(`→ ${item.name}`);
			continue;
		}

		const preview = item.text.trim().split("\n").slice(-3).join("\n");
		if (preview) lines.push(preview);
	}

	return lines;
}

function updateCommandProgress(
	ctx: CommandContext,
	result: SingleResult,
): void {
	ctx.ui.setStatus?.(
		"subagent-command",
		`${formatAgentCommandName(result.agent)} running…`,
	);
	ctx.ui.setWidget?.("subagent-command", renderProgressLines(result));
}

function clearCommandProgress(ctx: CommandContext): void {
	ctx.ui.setStatus?.("subagent-command", undefined);
	ctx.ui.setWidget?.("subagent-command", undefined);
}

function sendAgentCommandResult(
	pi: ExtensionAPI,
	result: SingleResult,
	task: string,
): void {
	const output = getResultOutput(result);
	pi.sendMessage({
		customType: "subagent-command",
		content: output,
		display: true,
		details: {
			agent: result.agent,
			agentSource: result.agentSource,
			task,
			output,
			usage: result.usage,
			model: result.model,
			exitCode: result.exitCode,
			stopReason: result.stopReason,
			errorMessage: result.errorMessage,
		} satisfies AgentCommandResultDetails,
	});
}

async function runNamedAgentCommand(
	pi: ExtensionAPI,
	ctx: CommandContext,
	agentName: string,
	task: string,
): Promise<void> {
	const discovery = discoverAgents(ctx.cwd, "both");
	const agent = discovery.agents.find(
		(candidate) => candidate.name === agentName,
	);
	if (!agent) {
		ctx.ui.notify(`Unknown agent: ${agentName}`, "error");
		return;
	}

	const ok = await confirmProjectAgentIfNeeded(
		ctx,
		agent,
		discovery.projectAgentsDir,
	);
	if (!ok) return;

	try {
		const result = await runSingleAgent(
			ctx.cwd,
			discovery.agents,
			agent.name,
			task,
			undefined,
			undefined,
			undefined,
			(partial) => {
				const currentResult = partial.details?.results[0];
				if (!currentResult) return;
				updateCommandProgress(ctx, currentResult);
			},
			(results) => createCommandDetails(discovery.projectAgentsDir, results),
		);
		sendAgentCommandResult(pi, result, task);
	} finally {
		clearCommandProgress(ctx);
	}
}

export function registerSubagentCommandRenderer(pi: ExtensionAPI): void {
	pi.registerMessageRenderer(
		"subagent-command",
		(message, { expanded }, theme) => {
			const details = message.details as AgentCommandResultDetails | undefined;
			if (!details) {
				return new Markdown(message.content, 0, 0, getMarkdownTheme());
			}

			const isError =
				details.exitCode !== 0 ||
				details.stopReason === "error" ||
				details.stopReason === "aborted";
			const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
			const header = `${icon} ${theme.fg("toolTitle", theme.bold(formatAgentCommandName(details.agent)))}${theme.fg("muted", ` (${details.agentSource})`)}`;

			if (expanded) {
				const container = new Container();
				container.addChild(new Text(header, 0, 0));
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("muted", "Task:"), 0, 0));
				container.addChild(new Text(theme.fg("dim", details.task), 0, 0));
				if (isError && details.errorMessage) {
					container.addChild(new Spacer(1));
					container.addChild(
						new Text(theme.fg("error", `Error: ${details.errorMessage}`), 0, 0),
					);
				}
				container.addChild(new Spacer(1));
				container.addChild(
					new Markdown(details.output.trim(), 0, 0, getMarkdownTheme()),
				);
				const usage = formatUsageStats(details.usage, details.model);
				if (usage) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", usage), 0, 0));
				}
				return container;
			}

			const trimmedOutput = details.output.trim();
			const previewLines =
				trimmedOutput.split("\n").slice(0, 6).join("\n") || "(no output)";
			let text = `${header}\n${theme.fg("toolOutput", previewLines)}`;
			const usage = formatUsageStats(details.usage, details.model);
			if (usage) text += `\n${theme.fg("dim", usage)}`;
			if (trimmedOutput.split("\n").length > 6) {
				text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
			}
			return new Text(text, 0, 0);
		},
	);
}

export function registerSubagentCommands(
	pi: ExtensionAPI,
	getDiscoveredAgents: () => AgentConfig[],
): void {
	const registeredAgentCommands = new Set<string>();

	function registerPerAgentCommands(cwd: string): void {
		const discovery = discoverAgents(cwd, "both");
		for (const agent of discovery.agents) {
			if (!isCommandSafeAgentName(agent.name)) continue;
			const commandName = `agents:${agent.name}`;
			if (registeredAgentCommands.has(commandName)) continue;
			registeredAgentCommands.add(commandName);
			pi.registerCommand(commandName, {
				description: `${agent.description} (run with ${agent.name})`,
				handler: async (args, ctx) => {
					const task = args.trim();
					if (!task) {
						ctx.ui.notify(`Usage: /${commandName} <task>`, "warning");
						return;
					}
					await runNamedAgentCommand(pi, ctx, agent.name, task);
				},
			});
		}
	}

	pi.registerCommand("agents", {
		description:
			"Run a task with a named subagent: /agents <agent> <task>. Agent completions include each agent description.",
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
				const available =
					getDiscoveredAgents()
						.map((agent) => agent.name)
						.join(", ") || "none";
				ctx.ui.notify(
					`Usage: /agents <agent> <task>\nAvailable: ${available}`,
					"warning",
				);
				return;
			}
			await runNamedAgentCommand(pi, ctx, parsed.agent, parsed.task);
		},
	});

	registerPerAgentCommands(path.resolve("."));

	pi.on("session_start", async (_event, ctx) => {
		registerPerAgentCommands(ctx.cwd);
	});
}
