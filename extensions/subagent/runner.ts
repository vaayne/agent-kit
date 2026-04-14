import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { AgentConfig } from "./agents.js";
import type { SingleResult, SubagentDetails, ThinkingLevel } from "./types.js";
import { createEmptyUsageStats, getFinalOutput } from "./utils.js";

interface JsonEvent {
	type?: string;
	message?: Message;
}

export type OnUpdateCallback = (
	partial: AgentToolResult<SubagentDetails>,
) => void;

function writePromptToTempFile(
	agentName: string,
	prompt: string,
): { dir: string; filePath: string } {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
	const safeName = agentName.replace(/[^\w.-]+/g, "_");
	const filePath = path.join(tempDir, `prompt-${safeName}.md`);
	fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
	return { dir: tempDir, filePath };
}

function splitModelThinking(model: string | undefined): {
	model: string | undefined;
	thinking: ThinkingLevel | undefined;
} {
	if (!model) return { model: undefined, thinking: undefined };
	const match = model.match(/^(.*):(off|minimal|low|medium|high|xhigh)$/);
	if (!match) return { model, thinking: undefined };
	return {
		model: match[1],
		thinking: match[2] as ThinkingLevel,
	};
}

function resolveRunModel(agent: AgentConfig, overrides?: {
	model?: string;
	thinking?: ThinkingLevel;
}): { model?: string; thinking?: ThinkingLevel; label?: string } {
	const base = splitModelThinking(overrides?.model ?? agent.model);
	const model = base.model;
	const thinking = overrides?.thinking ?? base.thinking ?? agent.thinking;
	const label = model ? `${model}${thinking ? `:${thinking}` : ""}` : undefined;
	return { model, thinking, label };
}

export async function runSingleAgent(
	defaultCwd: string,
	agents: AgentConfig[],
	agentName: string,
	task: string,
	cwd: string | undefined,
	step: number | undefined,
	signal: AbortSignal | undefined,
	onUpdate: OnUpdateCallback | undefined,
	makeDetails: (results: SingleResult[]) => SubagentDetails,
	overrides?: { model?: string; thinking?: ThinkingLevel },
): Promise<SingleResult> {
	const agent = agents.find((candidate) => candidate.name === agentName);
	if (!agent) {
		return {
			agent: agentName,
			agentSource: "unknown",
			task,
			exitCode: 1,
			messages: [],
			stderr: `Unknown agent: ${agentName}`,
			usage: createEmptyUsageStats(),
			step,
		};
	}

	const resolvedModel = resolveRunModel(agent, overrides);
	const args: string[] = ["--mode", "json", "-p", "--no-session"];
	if (resolvedModel.model) args.push("--model", resolvedModel.model);
	if (resolvedModel.thinking) args.push("--thinking", resolvedModel.thinking);
	if (agent.tools && agent.tools.length > 0) {
		args.push("--tools", agent.tools.join(","));
	}

	const currentResult: SingleResult = {
		agent: agentName,
		agentSource: agent.source,
		task,
		exitCode: 0,
		messages: [],
		stderr: "",
		usage: createEmptyUsageStats(),
		model: resolvedModel.label,
		step,
	};

	let tempPromptDir: string | null = null;
	let tempPromptPath: string | null = null;

	function emitUpdate(): void {
		if (!onUpdate) return;
		onUpdate({
			content: [
				{
					type: "text",
					text: getFinalOutput(currentResult.messages) || "(running...)",
				},
			],
			details: makeDetails([currentResult]),
		});
	}

	try {
		if (agent.systemPrompt.trim()) {
			const tempPrompt = writePromptToTempFile(agent.name, agent.systemPrompt);
			tempPromptDir = tempPrompt.dir;
			tempPromptPath = tempPrompt.filePath;
			args.push("--append-system-prompt", tempPromptPath);
		}

		args.push(`Task: ${task}`);
		let wasAborted = false;

		const exitCode = await new Promise<number>((resolve) => {
			const process = spawn("pi", args, {
				cwd: cwd ?? defaultCwd,
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});
			let buffer = "";

			function processLine(line: string): void {
				if (!line.trim()) return;

				let event: JsonEvent;
				try {
					event = JSON.parse(line) as JsonEvent;
				} catch {
					return;
				}

				if (event.type === "message_end" && event.message) {
					const message = event.message as Message;
					currentResult.messages.push(message);
					if (message.role === "assistant") {
						const usage = message.usage;
						currentResult.usage.turns++;
						if (usage) {
							currentResult.usage.input += usage.input || 0;
							currentResult.usage.output += usage.output || 0;
							currentResult.usage.cacheRead += usage.cacheRead || 0;
							currentResult.usage.cacheWrite += usage.cacheWrite || 0;
							currentResult.usage.cost += usage.cost?.total || 0;
							currentResult.usage.contextTokens = usage.totalTokens || 0;
						}
						if (!currentResult.model && message.model)
							currentResult.model = message.model;
						if (message.stopReason)
							currentResult.stopReason = message.stopReason;
						if (message.errorMessage)
							currentResult.errorMessage = message.errorMessage;
					}
					emitUpdate();
				}

				if (event.type === "tool_result_end" && event.message) {
					currentResult.messages.push(event.message as Message);
					emitUpdate();
				}
			}

			process.stdout.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(line);
			});

			process.stderr.on("data", (data) => {
				currentResult.stderr += data.toString();
			});

			process.on("close", (code) => {
				if (buffer.trim()) processLine(buffer);
				resolve(code ?? 0);
			});

			process.on("error", () => {
				resolve(1);
			});

			if (signal) {
				function killProcess(): void {
					wasAborted = true;
					process.kill("SIGTERM");
					setTimeout(() => {
						if (!process.killed) process.kill("SIGKILL");
					}, 5000);
				}
				if (signal.aborted) killProcess();
				else signal.addEventListener("abort", killProcess, { once: true });
			}
		});

		currentResult.exitCode = exitCode;
		if (wasAborted) throw new Error("Subagent was aborted");
		return currentResult;
	} finally {
		if (tempPromptPath) {
			try {
				fs.unlinkSync(tempPromptPath);
			} catch {
				// ignore cleanup failures
			}
		}
		if (tempPromptDir) {
			try {
				fs.rmdirSync(tempPromptDir);
			} catch {
				// ignore cleanup failures
			}
		}
	}
}
