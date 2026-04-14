import * as os from "node:os";
import type { Message } from "@mariozechner/pi-ai";
import type { DisplayItem, SingleResult, UsageStats } from "./types.js";

export const COLLAPSED_ITEM_COUNT = 10;

export function formatAgentCommandName(agentName: string): string {
	return `/agent:${agentName}`;
}

export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}...`;
}

export function getTextContent(
	content: Array<{ type: string; text?: string }> | undefined,
): string {
	const firstContent = content?.[0];
	if (firstContent?.type !== "text") return "(no output)";
	return firstContent.text ?? "(no output)";
}

export function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

export function formatUsageStats(
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		cost: number;
		contextTokens?: number;
		turns?: number;
	},
	model?: string,
): string {
	const parts: string[] = [];
	if (usage.turns) {
		parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	}
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) {
		parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	}
	if (model) parts.push(model);
	return parts.join(" ");
}

export function formatToolCall(
	toolName: string,
	args: Record<string, unknown>,
	themeFg: (color: string, text: string) => string,
): string {
	function shortenPath(filePath: string): string {
		const home = os.homedir();
		if (!filePath.startsWith(home)) return filePath;
		return `~${filePath.slice(home.length)}`;
	}

	switch (toolName) {
		case "bash": {
			const command = (args.command as string) || "...";
			return (
				themeFg("muted", "$ ") +
				themeFg("toolOutput", truncateText(command, 60))
			);
		}
		case "read": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const offset = args.offset as number | undefined;
			const limit = args.limit as number | undefined;
			let text = themeFg("accent", filePath);
			if (offset !== undefined || limit !== undefined) {
				const startLine = offset ?? 1;
				const endLine = limit !== undefined ? startLine + limit - 1 : "";
				text += themeFg(
					"warning",
					`:${startLine}${endLine ? `-${endLine}` : ""}`,
				);
			}
			return themeFg("muted", "read ") + text;
		}
		case "write": {
			const rawPath = (args.file_path || args.path || "...") as string;
			const filePath = shortenPath(rawPath);
			const content = (args.content || "") as string;
			const lines = content.split("\n").length;
			let text = themeFg("muted", "write ") + themeFg("accent", filePath);
			if (lines > 1) text += themeFg("dim", ` (${lines} lines)`);
			return text;
		}
		case "edit": {
			const rawPath = (args.file_path || args.path || "...") as string;
			return (
				themeFg("muted", "edit ") + themeFg("accent", shortenPath(rawPath))
			);
		}
		case "ls": {
			const rawPath = (args.path || ".") as string;
			return themeFg("muted", "ls ") + themeFg("accent", shortenPath(rawPath));
		}
		case "find": {
			const pattern = (args.pattern || "*") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "find ") +
				themeFg("accent", pattern) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		case "grep": {
			const pattern = (args.pattern || "") as string;
			const rawPath = (args.path || ".") as string;
			return (
				themeFg("muted", "grep ") +
				themeFg("accent", `/${pattern}/`) +
				themeFg("dim", ` in ${shortenPath(rawPath)}`)
			);
		}
		default: {
			const argsText = JSON.stringify(args);
			return (
				themeFg("accent", toolName) +
				themeFg("dim", ` ${truncateText(argsText, 50)}`)
			);
		}
	}
}

export function getFinalOutput(messages: Message[]): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		for (const part of message.content) {
			if (part.type === "text") return part.text;
		}
	}
	return "";
}

export function getResultOutput(result: SingleResult): string {
	return (
		getFinalOutput(result.messages) ||
		result.errorMessage ||
		result.stderr ||
		"(no output)"
	);
}

export function getDisplayItems(messages: Message[]): DisplayItem[] {
	const items: DisplayItem[] = [];
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.content) {
			if (part.type === "text") {
				items.push({ type: "text", text: part.text });
				continue;
			}
			if (part.type === "toolCall") {
				items.push({ type: "toolCall", name: part.name, args: part.arguments });
			}
		}
	}
	return items;
}

export function mapWithConcurrencyLimit<TIn, TOut>(
	items: TIn[],
	concurrency: number,
	fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
	if (items.length === 0) return Promise.resolve([]);
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: TOut[] = new Array(items.length);
	let nextIndex = 0;
	const workers = new Array(limit).fill(null).map(async () => {
		while (true) {
			const current = nextIndex++;
			if (current >= items.length) return;
			results[current] = await fn(items[current], current);
		}
	});
	return Promise.all(workers).then(() => results);
}

export function isCommandSafeAgentName(name: string): boolean {
	return /^[A-Za-z0-9._-]+$/.test(name);
}

export function splitAgentTask(
	args: string,
): { agent: string; task: string } | null {
	const trimmed = args.trim();
	if (!trimmed) return null;

	const firstSpace = trimmed.search(/\s/);
	if (firstSpace === -1) return { agent: trimmed, task: "" };

	return {
		agent: trimmed.slice(0, firstSpace),
		task: trimmed.slice(firstSpace).trim(),
	};
}

export function isResultError(
	result: Pick<SingleResult, "exitCode" | "stopReason">,
): boolean {
	return (
		result.exitCode !== 0 ||
		result.stopReason === "error" ||
		result.stopReason === "aborted"
	);
}

export function createEmptyUsageStats(): UsageStats {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		contextTokens: 0,
		turns: 0,
	};
}

export function aggregateUsage(
	results: SingleResult[],
): Omit<UsageStats, "contextTokens"> {
	const total = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		turns: 0,
	};
	for (const result of results) {
		total.input += result.usage.input;
		total.output += result.usage.output;
		total.cacheRead += result.usage.cacheRead;
		total.cacheWrite += result.usage.cacheWrite;
		total.cost += result.usage.cost;
		total.turns += result.usage.turns;
	}
	return total;
}
