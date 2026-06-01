import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveProfileSettings } from "./model-env.js";
import type { PresetConfig } from "./presets.js";
import { saveDelegateSession } from "./session-store.js";
import type { DelegateDetails, SavedDelegateSession, SingleResult, ThinkingLevel } from "./types.js";
import { createEmptyUsageStats, getFinalOutput } from "./utils.js";

type JsonEvent = {
  type?: string;
  message?: Message;
  id?: string;
};

type RunConfig = {
  preset: string;
  presetSource: "preset" | "user" | "project" | "unknown";
  task: string;
  cwd: string;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
  systemPrompt: string;
  step?: number;
  resumeSessionId?: string;
};

export type OnUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;

function writePromptToTempFile(
  agentName: string,
  prompt: string,
): { dir: string; filePath: string } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-delegate-"));
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

function resolveRunModel(
  preset: PresetConfig,
  overrides?: {
    model?: string;
    thinking?: ThinkingLevel;
  },
): { model?: string; thinking?: ThinkingLevel; label?: string } {
  const profileSettings = resolveProfileSettings(preset.modelProfile);
  const base = splitModelThinking(overrides?.model ?? profileSettings.model);
  const thinking = overrides?.thinking ?? base.thinking ?? profileSettings.thinking ?? preset.thinking ?? "medium";
  const label = base.model ? `${base.model}:${thinking}` : undefined;

  return { model: base.model, thinking, label };
}

function createResult(config: RunConfig): SingleResult {
  return {
    preset: config.preset,
    presetSource: config.presetSource,
    task: config.task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: createEmptyUsageStats(),
    model: config.model ? `${config.model}:${config.thinking ?? "medium"}` : undefined,
    step: config.step,
    sessionId: config.resumeSessionId,
  };
}

function buildSavedSession(config: RunConfig, sessionId: string): SavedDelegateSession {
  return {
    sessionId,
    preset: config.preset,
    presetSource: config.presetSource,
    cwd: path.resolve(config.cwd),
    model: config.model,
    thinking: config.thinking,
    tools: config.tools,
    systemPrompt: config.systemPrompt,
  };
}

async function runConfiguredPreset(
  config: RunConfig,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
): Promise<SingleResult> {
  const args: string[] = ["--mode", "json", "-p"];
  if (config.resumeSessionId) {
    args.push("--session", config.resumeSessionId);
  }
  if (config.model) args.push("--model", config.model);
  if (config.thinking) args.push("--thinking", config.thinking);
  if (config.tools && config.tools.length > 0) {
    args.push("--tools", config.tools.join(","));
  }

  const currentResult = createResult(config);
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
    if (config.systemPrompt.trim()) {
      const tempPrompt = writePromptToTempFile(config.preset, config.systemPrompt);
      tempPromptDir = tempPrompt.dir;
      tempPromptPath = tempPrompt.filePath;
      args.push("--append-system-prompt", tempPromptPath);
    }

    args.push(`Task: ${config.task}`);
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn("pi", args, {
        cwd: config.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PI_DELEGATE: "1" },
      });
      let buffer = "";

      function applyAssistantMessage(message: Message): void {
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
        if (!currentResult.model && message.model) {
          currentResult.model = message.model;
        }
        if (message.stopReason) {
          currentResult.stopReason = message.stopReason;
        }
        if (message.errorMessage) {
          currentResult.errorMessage = message.errorMessage;
        }
      }

      function processLine(line: string): void {
        if (!line.trim()) return;

        let event: JsonEvent;
        try {
          event = JSON.parse(line) as JsonEvent;
        } catch {
          return;
        }

        if (event.type === "session" && event.id) {
          currentResult.sessionId = event.id;
          saveDelegateSession(buildSavedSession(config, event.id));
          emitUpdate();
          return;
        }

        if (!event.message) {
          return;
        }

        if (event.type !== "message_end" && event.type !== "tool_result_end") {
          return;
        }

        const message = event.message;
        currentResult.messages.push(message);
        if (event.type === "message_end" && message.role === "assistant") {
          applyAssistantMessage(message);
        }
        emitUpdate();
      }

      child.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });

      child.stderr.on("data", (data) => {
        currentResult.stderr += data.toString();
      });

      child.on("close", (code) => {
        if (abortHandler && signal) {
          signal.removeEventListener("abort", abortHandler);
        }
        if (buffer.trim()) {
          processLine(buffer);
        }
        resolve(code ?? 0);
      });

      child.on("error", () => {
        resolve(1);
      });

      let abortHandler: (() => void) | undefined;
      if (signal) {
        abortHandler = () => {
          wasAborted = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          }, 5000);
        };

        if (signal.aborted) {
          abortHandler();
        } else {
          signal.addEventListener("abort", abortHandler, { once: true });
        }
      }
    });

    currentResult.exitCode = exitCode;
    if (wasAborted) throw new Error("Delegate preset was aborted");
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

export async function runSingleDelegate(
  defaultCwd: string,
  presets: PresetConfig[],
  presetName: string,
  task: string,
  cwd: string | undefined,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
  overrides?: { model?: string; thinking?: ThinkingLevel },
): Promise<SingleResult> {
  const preset = presets.find((candidate) => candidate.name === presetName);
  if (!preset) {
    return {
      preset: presetName,
      presetSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown preset: ${presetName}`,
      usage: createEmptyUsageStats(),
      step,
    };
  }

  const resolvedModel = resolveRunModel(preset, overrides);
  return await runConfiguredPreset(
    {
      preset: presetName,
      presetSource: preset.source,
      task,
      cwd: cwd ?? defaultCwd,
      model: resolvedModel.model,
      thinking: resolvedModel.thinking,
      tools: preset.tools,
      systemPrompt: preset.systemPrompt,
      step,
    },
    signal,
    onUpdate,
    makeDetails,
  );
}

export async function resumeDelegateSession(
  metadata: SavedDelegateSession,
  task: string,
  step: number | undefined,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
): Promise<SingleResult> {
  return await runConfiguredPreset(
    {
      ...metadata,
      task,
      step,
      resumeSessionId: metadata.sessionId,
    },
    signal,
    onUpdate,
    makeDetails,
  );
}
