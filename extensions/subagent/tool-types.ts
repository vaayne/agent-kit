import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AgentScope } from "./agents.js";
import type { SubagentDetails } from "./types.js";

export type ToolUpdateCallback = (
	partial: AgentToolResult<SubagentDetails>,
) => void;

export type ThemeLike = {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

export type RenderableResult = {
	details?: unknown;
	content: Array<{ type: string; text?: string }>;
};

export type RenderableArgs = {
	options?: { scope?: AgentScope };
	sequence?: Array<{ name: string; prompt: string }>;
	parallel?: Array<{ name: string; prompt: string }>;
	name?: string;
	prompt?: string;
};
