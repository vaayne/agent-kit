import type { Message } from "@mariozechner/pi-ai";
import type { AgentScope } from "./agents.js";

export type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type UsageStats = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	contextTokens: number;
	turns: number;
};

export type SingleResult = {
	agent: string;
	agentSource: "user" | "project" | "unknown";
	task: string;
	exitCode: number;
	messages: Message[];
	stderr: string;
	usage: UsageStats;
	sessionId?: string;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	step?: number;
};

export type SubagentDetails = {
	mode: "single" | "parallel" | "chain" | "resume";
	agentScope: AgentScope;
	projectAgentsDir: string | null;
	results: SingleResult[];
};

export type SavedSubagentSession = {
	sessionId: string;
	agent: string;
	agentSource: "user" | "project" | "unknown";
	cwd: string;
	model?: string;
	thinking?: ThinkingLevel;
	tools?: string[];
	systemPrompt: string;
};

export type DisplayItem =
	| { type: "text"; text: string }
	| { type: "toolCall"; name: string; args: Record<string, unknown> };
