import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import { type OnUpdateCallback, runSingleAgent } from "./runner.js";
import {
	AgentToolParams,
	MAX_CONCURRENCY,
	MAX_PARALLEL_TASKS,
} from "./schemas.js";
import type { SingleResult, SubagentDetails, ThinkingLevel } from "./types.js";
import {
	aggregateUsage,
	COLLAPSED_ITEM_COUNT,
	createEmptyUsageStats,
	formatToolCall,
	formatUsageStats,
	getDisplayItems,
	getFinalOutput,
	getResultOutput,
	getTextContent,
	isResultError,
	mapWithConcurrencyLimit,
	truncateText,
} from "./utils.js";

type ToolUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

interface ThemeLike {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
}

interface RenderableResult {
	details?: unknown;
	content: Array<{ type: string; text?: string }>;
}

interface RenderableArgs {
	options?: { scope?: AgentScope };
	sequence?: Array<{ name: string; prompt: string }>;
	parallel?: Array<{ name: string; prompt: string }>;
	name?: string;
	prompt?: string;
}

function getResultIcon(
	theme: ThemeLike,
	result: Pick<SingleResult, "exitCode" | "stopReason">,
): string {
	return isResultError(result)
		? theme.fg("error", "✗")
		: theme.fg("success", "✓");
}

function getParallelResultIcon(theme: ThemeLike, result: SingleResult): string {
	if (result.exitCode === -1) return theme.fg("warning", "⏳");
	return getResultIcon(theme, result);
}

function getParallelStatus(
	theme: ThemeLike,
	running: number,
	successCount: number,
	failCount: number,
	total: number,
): { icon: string; text: string } {
	if (running > 0) {
		return {
			icon: theme.fg("warning", "⏳"),
			text: `${successCount + failCount}/${total} done, ${running} running`,
		};
	}
	if (failCount > 0) {
		return {
			icon: theme.fg("warning", "◐"),
			text: `${successCount}/${total} runs`,
		};
	}
	return {
		icon: theme.fg("success", "✓"),
		text: `${successCount}/${total} runs`,
	};
}

function getCurrentMode(
	hasSequence: boolean,
	hasParallel: boolean,
): "single" | "parallel" | "chain" {
	if (hasSequence) return "chain";
	if (hasParallel) return "parallel";
	return "single";
}

function getAvailableAgentsText(agents: AgentConfig[]): string {
	return (
		agents.map((agent) => `${agent.name} (${agent.source})`).join(", ") ||
		"none"
	);
}

function confirmRequestedProjectAgents(
	params: {
		sequence?: Array<{ name: string }>;
		parallel?: Array<{ name: string }>;
		name?: string;
	},
	agents: AgentConfig[],
): AgentConfig[] {
	const requestedAgentNames = new Set<string>();
	if (params.sequence) {
		for (const step of params.sequence) requestedAgentNames.add(step.name);
	}
	if (params.parallel) {
		for (const task of params.parallel) requestedAgentNames.add(task.name);
	}
	if (params.name) requestedAgentNames.add(params.name);

	return Array.from(requestedAgentNames)
		.map((name) => agents.find((agent) => agent.name === name))
		.filter((agent): agent is AgentConfig => agent?.source === "project");
}

async function confirmProjectAgentsIfNeeded(
	ctx: {
		hasUI: boolean;
		ui: { confirm: (title: string, message: string) => Promise<boolean> };
	},
	agentScope: AgentScope,
	confirmProjectAgents: boolean,
	agents: AgentConfig[],
	projectAgentsDir: string | null,
	params: {
		sequence?: Array<{ name: string }>;
		parallel?: Array<{ name: string }>;
		name?: string;
	},
): Promise<boolean> {
	if (
		(agentScope !== "project" && agentScope !== "both") ||
		!confirmProjectAgents ||
		!ctx.hasUI
	) {
		return true;
	}

	const projectAgentsRequested = confirmRequestedProjectAgents(params, agents);
	if (projectAgentsRequested.length === 0) return true;

	const names = projectAgentsRequested.map((agent) => agent.name).join(", ");
	const sourceDir = projectAgentsDir ?? "(unknown)";
	return await ctx.ui.confirm(
		"Run project-local agents?",
		`Agents: ${names}\nSource: ${sourceDir}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
	);
}

function createDetailsFactory(
	mode: "single" | "parallel" | "chain",
	agentScope: AgentScope,
	projectAgentsDir: string | null,
): (results: SingleResult[]) => SubagentDetails {
	return (results) => ({ mode, agentScope, projectAgentsDir, results });
}

function createRunningResult(
	agent: string,
	task: string,
	overrides?: { model?: string; thinking?: ThinkingLevel },
): SingleResult {
	return {
		agent,
		agentSource: "unknown",
		task,
		exitCode: -1,
		messages: [],
		stderr: "",
		usage: createEmptyUsageStats(),
		model: overrides?.model
			? `${overrides.model}${overrides.thinking ? `:${overrides.thinking}` : ""}`
			: undefined,
	};
}

async function executeChainMode(
	ctx: { cwd: string },
	params: {
		sequence: Array<{
			name: string;
			prompt: string;
			cwd?: string;
			model?: string;
			thinking?: ThinkingLevel;
		}>;
	},
	agents: AgentConfig[],
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	defaultOverrides?: { model?: string; thinking?: ThinkingLevel },
) {
	const results: SingleResult[] = [];
	let previousOutput = "";

	for (let index = 0; index < params.sequence.length; index++) {
		const step = params.sequence[index];
		const taskWithContext = step.prompt.replace(
			/\{previous\}/g,
			previousOutput,
		);
		const chainUpdate: OnUpdateCallback | undefined = onUpdate
			? (partial) => {
					const currentResult = partial.details?.results[0];
					if (!currentResult) return;
					onUpdate({
						content: partial.content,
						details: makeDetails([...results, currentResult]),
					});
				}
			: undefined;

		const result = await runSingleAgent(
			ctx.cwd,
			agents,
			step.name,
			taskWithContext,
			step.cwd,
			index + 1,
			signal,
			chainUpdate,
			makeDetails,
			{
				model: step.model ?? defaultOverrides?.model,
				thinking: step.thinking ?? defaultOverrides?.thinking,
			},
		);
		results.push(result);
		if (isResultError(result)) {
			return {
				content: [
					{
						type: "text",
						text: `Sequence stopped at step ${index + 1} (${step.name}): ${getResultOutput(result)}`,
					},
				],
				details: makeDetails(results),
				isError: true,
			};
		}
		previousOutput = getFinalOutput(result.messages);
	}

	return {
		content: [
			{
				type: "text",
				text:
					getFinalOutput(results[results.length - 1].messages) || "(no output)",
			},
		],
		details: makeDetails(results),
	};
}

async function executeParallelMode(
	ctx: { cwd: string },
	params: {
		parallel: Array<{
			name: string;
			prompt: string;
			cwd?: string;
			model?: string;
			thinking?: ThinkingLevel;
		}>;
	},
	agents: AgentConfig[],
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	defaultOverrides?: { model?: string; thinking?: ThinkingLevel },
) {
	if (params.parallel.length > MAX_PARALLEL_TASKS) {
		return {
			content: [
				{
					type: "text",
					text: `Too many parallel runs (${params.parallel.length}). Max is ${MAX_PARALLEL_TASKS}.`,
				},
			],
			details: makeDetails([]),
		};
	}

	const allResults = params.parallel.map((task) =>
		createRunningResult(task.name, task.prompt, {
			model: task.model ?? defaultOverrides?.model,
			thinking: task.thinking ?? defaultOverrides?.thinking,
		}),
	);

	function emitParallelUpdate(): void {
		if (!onUpdate) return;
		const running = allResults.filter(
			(result) => result.exitCode === -1,
		).length;
		const done = allResults.length - running;
		onUpdate({
			content: [
				{
					type: "text",
					text: `Parallel: ${done}/${allResults.length} done, ${running} running...`,
				},
			],
			details: makeDetails([...allResults]),
		});
	}

	const results = await mapWithConcurrencyLimit(
		params.parallel,
		MAX_CONCURRENCY,
		async (task, index) => {
			const result = await runSingleAgent(
				ctx.cwd,
				agents,
				task.name,
				task.prompt,
				task.cwd,
				undefined,
				signal,
				(partial) => {
					const currentResult = partial.details?.results[0];
					if (!currentResult) return;
					allResults[index] = currentResult;
					emitParallelUpdate();
				},
				makeDetails,
				{
					model: task.model ?? defaultOverrides?.model,
					thinking: task.thinking ?? defaultOverrides?.thinking,
				},
			);
			allResults[index] = result;
			emitParallelUpdate();
			return result;
		},
	);

	const successCount = results.filter((result) => result.exitCode === 0).length;
	const summaries = results.map((result) => {
		const output = getFinalOutput(result.messages);
		const preview = truncateText(output, 100);
		const status = result.exitCode === 0 ? "completed" : "failed";
		return `[${result.agent}] ${status}: ${preview || "(no output)"}`;
	});

	return {
		content: [
			{
				type: "text",
				text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`,
			},
		],
		details: makeDetails(results),
	};
}

async function executeSingleMode(
	ctx: { cwd: string },
	params: {
		name: string;
		prompt: string;
		cwd?: string;
		model?: string;
		thinking?: ThinkingLevel;
	},
	agents: AgentConfig[],
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
) {
	const result = await runSingleAgent(
		ctx.cwd,
		agents,
		params.name,
		params.prompt,
		params.cwd,
		undefined,
		signal,
		onUpdate,
		makeDetails,
		{ model: params.model, thinking: params.thinking },
	);
	if (isResultError(result)) {
		return {
			content: [
				{
					type: "text",
					text: `Agent ${result.stopReason || "failed"}: ${getResultOutput(result)}`,
				},
			],
			details: makeDetails([result]),
			isError: true,
		};
	}
	return {
		content: [
			{ type: "text", text: getFinalOutput(result.messages) || "(no output)" },
		],
		details: makeDetails([result]),
	};
}

function renderToolCall(args: RenderableArgs, theme: ThemeLike) {
	const scope: AgentScope = args.options?.scope ?? "user";
	const sequence = args.sequence;
	if (sequence && sequence.length > 0) {
		let text =
			theme.fg("toolTitle", theme.bold("agent ")) +
			theme.fg("accent", `sequence (${sequence.length} steps)`) +
			theme.fg("muted", ` [${scope}]`);
		for (let index = 0; index < Math.min(sequence.length, 3); index++) {
			const step = sequence[index];
			const cleanTask = step.prompt.replace(/\{previous\}/g, "").trim();
			const preview = truncateText(cleanTask, 40);
			text +=
				"\n  " +
				theme.fg("muted", `${index + 1}.`) +
				" " +
				theme.fg("accent", step.name) +
				theme.fg("dim", ` ${preview}`);
		}
		if (sequence.length > 3) {
			text += `\n  ${theme.fg("muted", `... +${sequence.length - 3} more`)}`;
		}
		return new Text(text, 0, 0);
	}
	const parallel = args.parallel;
	if (parallel && parallel.length > 0) {
		let text =
			theme.fg("toolTitle", theme.bold("agent ")) +
			theme.fg("accent", `parallel (${parallel.length} runs)`) +
			theme.fg("muted", ` [${scope}]`);
		for (const task of parallel.slice(0, 3)) {
			const preview = truncateText(task.prompt, 40);
			text += `\n  ${theme.fg("accent", task.name)}${theme.fg("dim", ` ${preview}`)}`;
		}
		if (parallel.length > 3) {
			text += `\n  ${theme.fg("muted", `... +${parallel.length - 3} more`)}`;
		}
		return new Text(text, 0, 0);
	}
	const agentName = args.name || "...";
	const preview = args.prompt ? truncateText(args.prompt, 60) : "...";
	let text =
		theme.fg("toolTitle", theme.bold("agent ")) +
		theme.fg("accent", agentName) +
		theme.fg("muted", ` [${scope}]`);
	text += `\n  ${theme.fg("dim", preview)}`;
	return new Text(text, 0, 0);
}

function renderDisplayItems(
	items: ReturnType<typeof getDisplayItems>,
	expanded: boolean,
	theme: ThemeLike,
	limit?: number,
): string {
	const toShow = limit ? items.slice(-limit) : items;
	const skipped = limit && items.length > limit ? items.length - limit : 0;
	let text = "";
	if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
	for (const item of toShow) {
		if (item.type === "text") {
			const preview = expanded
				? item.text
				: item.text.split("\n").slice(0, 3).join("\n");
			text += `${theme.fg("toolOutput", preview)}\n`;
			continue;
		}
		text += `${theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme))}\n`;
	}
	return text.trimEnd();
}

function renderSingleResult(
	details: SubagentDetails,
	expanded: boolean,
	theme: ThemeLike,
) {
	const result = details.results[0];
	const isError = isResultError(result);
	const icon = getResultIcon(theme, result);
	const displayItems = getDisplayItems(result.messages);
	const finalOutput = getFinalOutput(result.messages);

	if (expanded) {
		const container = new Container();
		let header = `${icon} ${theme.fg("toolTitle", theme.bold(result.agent))}${theme.fg("muted", ` (${result.agentSource})`)}`;
		if (isError && result.stopReason)
			header += ` ${theme.fg("error", `[${result.stopReason}]`)}`;
		container.addChild(new Text(header, 0, 0));
		if (isError && result.errorMessage) {
			container.addChild(
				new Text(theme.fg("error", `Error: ${result.errorMessage}`), 0, 0),
			);
		}
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Prompt ───"), 0, 0));
		container.addChild(new Text(theme.fg("dim", result.task), 0, 0));
		container.addChild(new Spacer(1));
		container.addChild(new Text(theme.fg("muted", "─── Output ───"), 0, 0));
		if (displayItems.length === 0 && !finalOutput) {
			container.addChild(new Text(theme.fg("muted", "(no output)"), 0, 0));
		} else {
			for (const item of displayItems) {
				if (item.type !== "toolCall") continue;
				container.addChild(
					new Text(
						theme.fg("muted", "→ ") +
							formatToolCall(item.name, item.args, theme.fg.bind(theme)),
						0,
						0,
					),
				);
			}
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(
					new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()),
				);
			}
		}
		const usageText = formatUsageStats(result.usage, result.model);
		if (usageText) {
			container.addChild(new Spacer(1));
			container.addChild(new Text(theme.fg("dim", usageText), 0, 0));
		}
		return container;
	}

	let text = `${icon} ${theme.fg("toolTitle", theme.bold(result.agent))}${theme.fg("muted", ` (${result.agentSource})`)}`;
	if (isError && result.stopReason)
		text += ` ${theme.fg("error", `[${result.stopReason}]`)}`;
	if (isError && result.errorMessage)
		text += `\n${theme.fg("error", `Error: ${result.errorMessage}`)}`;
	else if (displayItems.length === 0)
		text += `\n${theme.fg("muted", "(no output)")}`;
	else {
		text += `\n${renderDisplayItems(displayItems, expanded, theme, COLLAPSED_ITEM_COUNT)}`;
		if (displayItems.length > COLLAPSED_ITEM_COUNT) {
			text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
		}
	}
	const usageText = formatUsageStats(result.usage, result.model);
	if (usageText) text += `\n${theme.fg("dim", usageText)}`;
	return new Text(text, 0, 0);
}

function renderChainResult(
	details: SubagentDetails,
	expanded: boolean,
	theme: ThemeLike,
) {
	const successCount = details.results.filter(
		(result) => result.exitCode === 0,
	).length;
	const icon =
		successCount === details.results.length
			? theme.fg("success", "✓")
			: theme.fg("error", "✗");

	if (expanded) {
		const container = new Container();
		container.addChild(
			new Text(
				icon +
					" " +
					theme.fg("toolTitle", theme.bold("sequence ")) +
					theme.fg("accent", `${successCount}/${details.results.length} steps`),
				0,
				0,
			),
		);
		for (const result of details.results) {
			const resultIcon = getResultIcon(theme, result);
			const displayItems = getDisplayItems(result.messages);
			const finalOutput = getFinalOutput(result.messages);
			container.addChild(new Spacer(1));
			container.addChild(
				new Text(
					`${theme.fg("muted", `─── Step ${result.step}: `) + theme.fg("accent", result.agent)} ${resultIcon}`,
					0,
					0,
				),
			);
			container.addChild(
				new Text(
					theme.fg("muted", "Prompt: ") + theme.fg("dim", result.task),
					0,
					0,
				),
			);
			for (const item of displayItems) {
				if (item.type !== "toolCall") continue;
				container.addChild(
					new Text(
						theme.fg("muted", "→ ") +
							formatToolCall(item.name, item.args, theme.fg.bind(theme)),
						0,
						0,
					),
				);
			}
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(
					new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()),
				);
			}
			const usageText = formatUsageStats(result.usage, result.model);
			if (usageText)
				container.addChild(new Text(theme.fg("dim", usageText), 0, 0));
		}
		const usageText = formatUsageStats(aggregateUsage(details.results));
		if (usageText) {
			container.addChild(new Spacer(1));
			container.addChild(
				new Text(theme.fg("dim", `Total: ${usageText}`), 0, 0),
			);
		}
		return container;
	}

	let text =
		icon +
		" " +
		theme.fg("toolTitle", theme.bold("sequence ")) +
		theme.fg("accent", `${successCount}/${details.results.length} steps`);
	for (const result of details.results) {
		const resultIcon = getResultIcon(theme, result);
		const displayItems = getDisplayItems(result.messages);
		text += `\n\n${theme.fg("muted", `─── Step ${result.step}: `)}${theme.fg("accent", result.agent)} ${resultIcon}`;
		text +=
			displayItems.length === 0
				? `\n${theme.fg("muted", "(no output)")}`
				: `\n${renderDisplayItems(displayItems, expanded, theme, 5)}`;
	}
	const usageText = formatUsageStats(aggregateUsage(details.results));
	if (usageText) text += `\n\n${theme.fg("dim", `Total: ${usageText}`)}`;
	text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}

function renderParallelResult(
	details: SubagentDetails,
	expanded: boolean,
	theme: ThemeLike,
) {
	const running = details.results.filter(
		(result) => result.exitCode === -1,
	).length;
	const successCount = details.results.filter(
		(result) => result.exitCode === 0,
	).length;
	const failCount = details.results.filter(
		(result) => result.exitCode > 0,
	).length;
	const isRunning = running > 0;
	const parallelStatus = getParallelStatus(
		theme,
		running,
		successCount,
		failCount,
		details.results.length,
	);
	const icon = parallelStatus.icon;
	const status = parallelStatus.text;

	if (expanded && !isRunning) {
		const container = new Container();
		container.addChild(
			new Text(
				`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`,
				0,
				0,
			),
		);
		for (const result of details.results) {
			const resultIcon = getResultIcon(theme, result);
			const displayItems = getDisplayItems(result.messages);
			const finalOutput = getFinalOutput(result.messages);
			container.addChild(new Spacer(1));
			container.addChild(
				new Text(
					`${theme.fg("muted", "─── ") + theme.fg("accent", result.agent)} ${resultIcon}`,
					0,
					0,
				),
			);
			container.addChild(
				new Text(
					theme.fg("muted", "Prompt: ") + theme.fg("dim", result.task),
					0,
					0,
				),
			);
			for (const item of displayItems) {
				if (item.type !== "toolCall") continue;
				container.addChild(
					new Text(
						theme.fg("muted", "→ ") +
							formatToolCall(item.name, item.args, theme.fg.bind(theme)),
						0,
						0,
					),
				);
			}
			if (finalOutput) {
				container.addChild(new Spacer(1));
				container.addChild(
					new Markdown(finalOutput.trim(), 0, 0, getMarkdownTheme()),
				);
			}
			const usageText = formatUsageStats(result.usage, result.model);
			if (usageText)
				container.addChild(new Text(theme.fg("dim", usageText), 0, 0));
		}
		const usageText = formatUsageStats(aggregateUsage(details.results));
		if (usageText) {
			container.addChild(new Spacer(1));
			container.addChild(
				new Text(theme.fg("dim", `Total: ${usageText}`), 0, 0),
			);
		}
		return container;
	}

	let text = `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}`;
	for (const result of details.results) {
		const resultIcon = getParallelResultIcon(theme, result);
		const displayItems = getDisplayItems(result.messages);
		text += `\n\n${theme.fg("muted", "─── ")}${theme.fg("accent", result.agent)} ${resultIcon}`;
		if (displayItems.length === 0) {
			const emptyState =
				result.exitCode === -1 ? "(running...)" : "(no output)";
			text += `\n${theme.fg("muted", emptyState)}`;
		} else {
			text += `\n${renderDisplayItems(displayItems, expanded, theme, 5)}`;
		}
	}
	if (!isRunning) {
		const usageText = formatUsageStats(aggregateUsage(details.results));
		if (usageText) text += `\n\n${theme.fg("dim", `Total: ${usageText}`)}`;
	}
	if (!expanded) text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
	return new Text(text, 0, 0);
}

function renderToolResult(
	result: RenderableResult,
	options: { expanded: boolean },
	theme: ThemeLike,
) {
	const details = result.details as SubagentDetails | undefined;
	if (!details || details.results.length === 0) {
		return new Text(getTextContent(result.content), 0, 0);
	}
	if (details.mode === "single" && details.results.length === 1) {
		return renderSingleResult(details, options.expanded, theme);
	}
	if (details.mode === "chain") {
		return renderChainResult(details, options.expanded, theme);
	}
	if (details.mode === "parallel") {
		return renderParallelResult(details, options.expanded, theme);
	}
	return new Text(getTextContent(result.content), 0, 0);
}

export function registerAgentTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "agent",
		label: "Agent",
		description: [
			"Delegate work to specialized agents with isolated context.",
			"Modes: single (name + prompt), parallel (parallel array), sequence (sequence array with {previous}).",
			'Default scope is "user" (from ~/.pi/agent/agents).',
			'To enable project-local agents in .pi/agents, set options.scope to "both" (or "project").',
			"You can override an agent's default model and thinking level at runtime via options.model/options.thinking or per-run fields.",
		].join(" "),
		parameters: AgentToolParams,
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const agentScope: AgentScope = params.options?.scope ?? "user";
			const discovery = discoverAgents(ctx.cwd, agentScope);
			const agents = discovery.agents;
			const confirmProjectAgents = params.options?.confirmProject ?? true;
			const hasSequence = (params.sequence?.length ?? 0) > 0;
			const hasParallel = (params.parallel?.length ?? 0) > 0;
			const hasSingle = Boolean(params.name && params.prompt);
			const modeCount =
				Number(hasSequence) + Number(hasParallel) + Number(hasSingle);
			const currentMode = getCurrentMode(hasSequence, hasParallel);

			if (modeCount !== 1) {
				return {
					content: [
						{
							type: "text",
							text: `Invalid parameters. Provide exactly one mode.\nAvailable agents: ${getAvailableAgentsText(agents)}`,
						},
					],
					details: createDetailsFactory(
						"single",
						agentScope,
						discovery.projectAgentsDir,
					)([]),
				};
			}

			const approved = await confirmProjectAgentsIfNeeded(
				ctx,
				agentScope,
				confirmProjectAgents,
				agents,
				discovery.projectAgentsDir,
				params,
			);
			if (!approved) {
				return {
					content: [
						{
							type: "text",
							text: "Canceled: project-local agents not approved.",
						},
					],
					details: createDetailsFactory(
						currentMode,
						agentScope,
						discovery.projectAgentsDir,
					)([]),
				};
			}

			if (params.sequence?.length) {
				return await executeChainMode(
					ctx,
					{ sequence: params.sequence },
					agents,
					signal,
					onUpdate,
					createDetailsFactory("chain", agentScope, discovery.projectAgentsDir),
					{
						model: params.options?.model,
						thinking: params.options?.thinking,
					},
				);
			}
			if (params.parallel?.length) {
				return await executeParallelMode(
					ctx,
					{ parallel: params.parallel },
					agents,
					signal,
					onUpdate,
					createDetailsFactory(
						"parallel",
						agentScope,
						discovery.projectAgentsDir,
					),
					{
						model: params.options?.model,
						thinking: params.options?.thinking,
					},
				);
			}
			if (params.name && params.prompt) {
				return await executeSingleMode(
					ctx,
					{
						name: params.name,
						prompt: params.prompt,
						cwd: params.options?.cwd,
						model: params.options?.model,
						thinking: params.options?.thinking,
					},
					agents,
					signal,
					onUpdate,
					createDetailsFactory(
						"single",
						agentScope,
						discovery.projectAgentsDir,
					),
				);
			}

			return {
				content: [
					{
						type: "text",
						text: `Invalid parameters. Available agents: ${getAvailableAgentsText(agents)}`,
					},
				],
				details: createDetailsFactory(
					"single",
					agentScope,
					discovery.projectAgentsDir,
				)([]),
			};
		},
		renderCall: renderToolCall,
		renderResult: renderToolResult,
	});
}
