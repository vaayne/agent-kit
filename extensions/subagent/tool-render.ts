import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import type { AgentScope } from "./agents.js";
import type { SingleResult, SubagentDetails } from "./types.js";
import {
	aggregateUsage,
	COLLAPSED_ITEM_COUNT,
	formatToolCall,
	formatUsageStats,
	getDisplayItems,
	getFinalOutput,
	getTextContent,
	isResultError,
	truncateText,
} from "./utils.js";
import type {
	RenderableArgs,
	RenderableResult,
	ThemeLike,
} from "./tool-types.js";

function getResultIcon(
	theme: ThemeLike,
	result: Pick<SingleResult, "exitCode" | "stopReason">,
): string {
	if (isResultError(result)) {
		return theme.fg("error", "✗");
	}

	return theme.fg("success", "✓");
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

export function renderToolCall(args: RenderableArgs, theme: ThemeLike) {
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

export function renderToolResult(
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
