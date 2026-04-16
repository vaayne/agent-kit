import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const DEFAULT_ADVISOR_MODEL = "claude-opus-4-6";

const ADVISOR_SYSTEM_PROMPT = `You are a senior technical advisor. A capable AI executor is consulting you because it has hit a decision it cannot confidently resolve on its own.

Your role:
- Provide clear, actionable guidance the executor can act on immediately
- Identify what the executor may have missed or gotten wrong
- Confirm when the executor is on the right track, with any important caveats
- Be concise — you are providing a plan, not implementing it

Keep your response under 600 tokens unless the problem genuinely requires more.`;

type AnthropicMessage = {
	role: "user" | "assistant";
	content: string;
};

function toAnthropicMessages(messages: AgentMessage[]): AnthropicMessage[] {
	const result: AnthropicMessage[] = [];
	for (const msg of messages) {
		if (msg.role !== "user" && msg.role !== "assistant") continue;

		const parts: string[] = [];
		for (const block of msg.content ?? []) {
			if (typeof block === "string") {
				parts.push(block);
			} else if (block.type === "text") {
				parts.push(block.text);
			} else if (block.type === "tool_use") {
				parts.push(`[called tool: ${block.name}]`);
			} else if (block.type === "tool_result") {
				const content = Array.isArray(block.content)
					? block.content
							.filter((c: { type: string }) => c.type === "text")
							.map((c: { text: string }) => c.text)
							.join("\n")
					: String(block.content ?? "");
				parts.push(`[tool result: ${content.slice(0, 500)}${content.length > 500 ? "…" : ""}]`);
			}
		}

		const text = parts.join("\n").trim();
		if (!text) continue;

		// Merge consecutive same-role messages (Anthropic API requires alternating)
		const last = result[result.length - 1];
		if (last && last.role === msg.role) {
			last.content += `\n\n${text}`;
		} else {
			result.push({ role: msg.role as "user" | "assistant", content: text });
		}
	}

	// Anthropic requires the last message to be from the user
	if (result.length > 0 && result[result.length - 1].role !== "user") {
		result.push({ role: "user", content: "(awaiting advisor guidance)" });
	}

	return result;
}

function buildHeaders(apiKey: string, isOAuth: boolean): Record<string, string> {
	const base: Record<string, string> = {
		"Content-Type": "application/json",
		"anthropic-version": "2023-06-01",
	};
	if (isOAuth) {
		base["Authorization"] = `Bearer ${apiKey}`;
	} else {
		base["x-api-key"] = apiKey;
	}
	return base;
}

async function callAdvisor(
	prompt: string,
	historyMessages: AgentMessage[],
	model: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
	const apiKey = oauthToken ?? process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		return "Advisor unavailable: set ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY to enable.";
	}

	const history = toAnthropicMessages(historyMessages);
	// Append the explicit prompt as the final user turn
	const messages: AnthropicMessage[] =
		history.length > 0
			? [...history.slice(0, -1), { role: "user", content: prompt }]
			: [{ role: "user", content: prompt }];

	let response: Response;
	try {
		response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: buildHeaders(apiKey, Boolean(oauthToken)),
			body: JSON.stringify({
				model,
				max_tokens: 1024,
				system: ADVISOR_SYSTEM_PROMPT,
				messages,
			}),
			signal,
		});
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		return `Advisor request failed: ${msg}`;
	}

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		return `Advisor error (${response.status}): ${body || response.statusText}`;
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text: string }>;
	};
	return data.content.find((b) => b.type === "text")?.text ?? "(no response from advisor)";
}

export function registerAdvisorTool(pi: ExtensionAPI): void {
	const advisorModel = process.env.PI_ADVISOR_MODEL ?? DEFAULT_ADVISOR_MODEL;
	let currentMessages: AgentMessage[] = [];

	pi.on("context", (event) => {
		currentMessages = event.messages;
	});

	pi.registerTool({
		name: "advisor",
		label: "Advisor",
		description: [
			`Consult a stronger advisor model (${advisorModel}) for guidance on a hard decision.`,
			"Use when stuck after multiple attempts, before a major or irreversible action, or when you need a second opinion.",
			"Describe your situation, what you've tried, and what specific guidance you need.",
		].join(" "),
		promptGuidelines: [
			"Call `advisor` when you've tried multiple approaches and are still uncertain",
			"Call `advisor` before making large or hard-to-reverse changes when you have doubts",
			"Call `advisor` when you need to decide between fundamentally different approaches",
		],
		parameters: Type.Object({
			prompt: Type.String({
				description:
					"Your question for the advisor. Include: what you are trying to accomplish, what you have already tried, and what specific guidance you need.",
			}),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const guidance = await callAdvisor(
				params.prompt,
				currentMessages,
				advisorModel,
				signal,
			);
			return {
				content: [{ type: "text", text: guidance }],
			};
		},
	});
}
