import { type AgentConfig, type AgentScope, discoverAgents } from "./agents.js";
import {
	type OnUpdateCallback,
	resumeAgentSession,
	runSingleAgent,
} from "./runner.js";
import { MAX_CONCURRENCY, MAX_PARALLEL_TASKS } from "./schemas.js";
import { loadSubagentSession } from "./session-store.js";
import type { ToolUpdateCallback } from "./tool-types.js";
import type { SingleResult, SubagentDetails, ThinkingLevel } from "./types.js";
import {
	createEmptyUsageStats,
	getFinalOutput,
	getResultOutput,
	isResultError,
	mapWithConcurrencyLimit,
	truncateText,
} from "./utils.js";

function getCurrentMode(
	hasSequence: boolean,
	hasParallel: boolean,
	hasResume: boolean,
): "single" | "parallel" | "chain" | "resume" {
	if (hasSequence) return "chain";
	if (hasParallel) return "parallel";
	if (hasResume) return "resume";
	return "single";
}

function getAvailableAgentsText(agents: AgentConfig[]): string {
	if (agents.length === 0) {
		return "none";
	}

	return agents.map((agent) => `${agent.name} (${agent.source})`).join(", ");
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
	mode: "single" | "parallel" | "chain" | "resume",
	agentScope: AgentScope,
	projectAgentsDir: string | null,
): (results: SingleResult[]) => SubagentDetails {
	return (results) => ({ mode, agentScope, projectAgentsDir, results });
}

function formatModelLabel(overrides?: {
	model?: string;
	thinking?: ThinkingLevel;
}): string | undefined {
	if (!overrides?.model) {
		return undefined;
	}

	return `${overrides.model}:${overrides.thinking ?? "medium"}`;
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
		model: formatModelLabel(overrides),
	};
}

function formatSessionLine(result: Pick<SingleResult, "sessionId">): string {
	return result.sessionId ? `\nSession ID: ${result.sessionId}` : "";
}

function formatSessionSummary(results: SingleResult[]): string {
	const lines = results
		.filter((result) => result.sessionId)
		.map((result) => {
			const stepPrefix = result.step ? `Step ${result.step} ` : "";
			return `${stepPrefix}${result.agent}: ${result.sessionId}`;
		});
	return lines.length > 0 ? `\n\nSession IDs:\n${lines.join("\n")}` : "";
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
						text: `Sequence stopped at step ${index + 1} (${step.name}): ${getResultOutput(result)}${formatSessionSummary(results)}`,
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
					(getFinalOutput(results[results.length - 1].messages) ||
						"(no output)") + formatSessionSummary(results),
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
		const sessionSuffix = result.sessionId
			? `\nSession ID: ${result.sessionId}`
			: "";
		return `[${result.agent}] ${status}: ${preview || "(no output)"}${sessionSuffix}`;
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
					text: `Agent ${result.stopReason || "failed"}: ${getResultOutput(result)}${formatSessionLine(result)}`,
				},
			],
			details: makeDetails([result]),
			isError: true,
		};
	}
	return {
		content: [
			{
				type: "text",
				text:
					(getFinalOutput(result.messages) || "(no output)") +
					formatSessionLine(result),
			},
		],
		details: makeDetails([result]),
	};
}

async function executeResumeMode(
	params: {
		sessionId: string;
		prompt: string;
	},
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	ctx: {
		hasUI: boolean;
		ui: { confirm: (title: string, message: string) => Promise<boolean> };
	},
	confirmProjectAgents: boolean,
	projectAgentsDir: string | null,
) {
	const metadata = loadSubagentSession(params.sessionId);
	if (!metadata) {
		return {
			content: [
				{
					type: "text",
					text:
						`Unknown subagent session: ${params.sessionId}\n` +
						"No saved subagent metadata was found for this session ID.",
				},
			],
			details: makeDetails([]),
			isError: true,
		};
	}

	// Check for project-local agent confirmation in resume mode
	if (confirmProjectAgents && ctx.hasUI && metadata.agentSource === "project") {
		const confirmed = await ctx.ui.confirm(
			"Run project-local agent from resumed session?",
			`Agent: ${metadata.agent}\nSource: project\nSession: ${params.sessionId}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`,
		);
		if (!confirmed) {
			return {
				content: [
					{
						type: "text",
						text: "Canceled: project-local agent not approved for resumed session.",
					},
				],
				details: makeDetails([]),
			};
		}
	}

	const result = await resumeAgentSession(
		metadata,
		params.prompt,
		undefined,
		signal,
		onUpdate,
		makeDetails,
	);
	if (isResultError(result)) {
		return {
			content: [
				{
					type: "text",
					text:
						`Agent ${result.stopReason || "failed"}: ${getResultOutput(result)}` +
						formatSessionLine(result),
				},
			],
			details: makeDetails([result]),
			isError: true,
		};
	}
	return {
		content: [
			{
				type: "text",
				text:
					(getFinalOutput(result.messages) || "(no output)") +
					formatSessionLine(result),
			},
		],
		details: makeDetails([result]),
	};
}

export async function executeAgentTool(
	params: {
		options?: {
			scope?: AgentScope;
			confirmProject?: boolean;
			cwd?: string;
			model?: string;
			thinking?: ThinkingLevel;
		};
		sequence?: Array<{
			name: string;
			prompt: string;
			cwd?: string;
			model?: string;
			thinking?: ThinkingLevel;
		}>;
		parallel?: Array<{
			name: string;
			prompt: string;
			cwd?: string;
			model?: string;
			thinking?: ThinkingLevel;
		}>;
		name?: string;
		sessionId?: string;
		prompt?: string;
	},
	signal: AbortSignal | undefined,
	onUpdate: ToolUpdateCallback | undefined,
	ctx: {
		cwd: string;
		hasUI: boolean;
		ui: { confirm: (title: string, message: string) => Promise<boolean> };
	},
) {
	const agentScope: AgentScope = params.options?.scope ?? "user";
	const discovery = discoverAgents(ctx.cwd, agentScope);
	const agents = discovery.agents;
	const confirmProjectAgents = params.options?.confirmProject ?? true;
	const hasSequence = (params.sequence?.length ?? 0) > 0;
	const hasParallel = (params.parallel?.length ?? 0) > 0;
	const hasSingle = Boolean(params.name && params.prompt);
	const hasResume = Boolean(params.sessionId && params.prompt);
	const modeCount =
		Number(hasSequence) +
		Number(hasParallel) +
		Number(hasSingle) +
		Number(hasResume);
	const currentMode = getCurrentMode(hasSequence, hasParallel, hasResume);

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
			createDetailsFactory("parallel", agentScope, discovery.projectAgentsDir),
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
			createDetailsFactory("single", agentScope, discovery.projectAgentsDir),
		);
	}
	if (params.sessionId && params.prompt) {
		return await executeResumeMode(
			{ sessionId: params.sessionId, prompt: params.prompt },
			signal,
			onUpdate,
			createDetailsFactory("resume", agentScope, discovery.projectAgentsDir),
			ctx,
			confirmProjectAgents,
			discovery.projectAgentsDir,
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
}
