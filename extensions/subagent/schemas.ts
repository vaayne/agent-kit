import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

export const MAX_PARALLEL_TASKS = 8;
export const MAX_CONCURRENCY = 4;

const AgentRunItem = Type.Object({
	name: Type.String({ description: "Name of the agent to invoke" }),
	prompt: Type.String({ description: "Prompt to send to the agent" }),
	cwd: Type.Optional(
		Type.String({ description: "Working directory for the agent process" }),
	),
});

const SequenceItem = Type.Object({
	name: Type.String({ description: "Name of the agent to invoke" }),
	prompt: Type.String({
		description: "Prompt with optional {previous} placeholder for prior output",
	}),
	cwd: Type.Optional(
		Type.String({ description: "Working directory for the agent process" }),
	),
});

export const AgentScopeSchema = StringEnum(
	["user", "project", "both"] as const,
	{
		description:
			'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
		default: "user",
	},
);

const AgentOptions = Type.Object({
	scope: Type.Optional(AgentScopeSchema),
	confirmProject: Type.Optional(
		Type.Boolean({
			description: "Prompt before running project-local agents. Default: true.",
			default: true,
		}),
	),
	cwd: Type.Optional(
		Type.String({
			description: "Working directory for the agent process (single mode)",
		}),
	),
});

export const AgentToolParams = Type.Object({
	name: Type.Optional(
		Type.String({
			description: "Name of the agent to invoke (for single run)",
		}),
	),
	prompt: Type.Optional(
		Type.String({
			description: "Prompt to send to the agent (for single run)",
		}),
	),
	parallel: Type.Optional(
		Type.Array(AgentRunItem, {
			description: "Array of {name, prompt} for parallel execution",
		}),
	),
	sequence: Type.Optional(
		Type.Array(SequenceItem, {
			description: "Array of {name, prompt} for sequential execution",
		}),
	),
	options: Type.Optional(AgentOptions),
});
