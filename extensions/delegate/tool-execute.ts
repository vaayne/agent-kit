import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { discoverPresets, type PresetConfig, type PresetScope } from "./presets.js";
import { type OnUpdateCallback, resumeDelegateSession, runSingleDelegate } from "./runner.js";
import { MAX_CONCURRENCY, MAX_PARALLEL_TASKS } from "./schemas.js";
import { loadDelegateSession } from "./session-store.js";
import type { ToolUpdateCallback } from "./tool-types.js";
import type { DelegateDetails, SingleResult, ThinkingLevel } from "./types.js";
import {
  createEmptyUsageStats,
  getFinalOutput,
  getResultOutput,
  isResultError,
  mapWithConcurrencyLimit,
  truncateText,
} from "./utils.js";

type RunOverrides = {
  model?: string;
  thinking?: ThinkingLevel;
};

type DelegateRunRequest = RunOverrides & {
  name: string;
  prompt: string;
  cwd?: string;
};

type DelegateToolParamsShape = {
  options?: RunOverrides & {
    scope?: PresetScope;
    confirmProject?: boolean;
    cwd?: string;
  };
  sequence?: DelegateRunRequest[];
  parallel?: DelegateRunRequest[];
  name?: string;
  sessionId?: string;
  prompt?: string;
};

type DelegateToolContext = {
  cwd: string;
  hasUI: boolean;
  ui: { confirm: (title: string, message: string) => Promise<boolean> };
};

type DelegateToolResult = AgentToolResult<DelegateDetails>;

function getCurrentMode(
  hasSequence: boolean,
  hasParallel: boolean,
  hasResume: boolean,
): DelegateDetails["mode"] {
  if (hasSequence) return "sequence";
  if (hasParallel) return "parallel";
  if (hasResume) return "resume";
  return "single";
}

function getAvailablePresetsText(presets: PresetConfig[]): string {
  if (presets.length === 0) {
    return "none";
  }

  return presets.map((preset) => `${preset.name} (${preset.source})`).join(", ");
}

function confirmRequestedProjectPresets(
  params: Pick<DelegateToolParamsShape, "sequence" | "parallel" | "name">,
  presets: PresetConfig[],
): PresetConfig[] {
  const requestedPresetNames = new Set<string>();
  if (params.sequence) {
    for (const step of params.sequence) requestedPresetNames.add(step.name);
  }
  if (params.parallel) {
    for (const task of params.parallel) requestedPresetNames.add(task.name);
  }
  if (params.name) requestedPresetNames.add(params.name);

  return Array.from(requestedPresetNames)
    .map((name) => presets.find((preset) => preset.name === name))
    .filter((preset): preset is PresetConfig => preset?.source === "project");
}

async function confirmProjectPresetsIfNeeded(
  ctx: DelegateToolContext,
  presetScope: PresetScope,
  confirmProjectPresets: boolean,
  presets: PresetConfig[],
  projectPresetsDir: string | null,
  params: Pick<DelegateToolParamsShape, "sequence" | "parallel" | "name">,
): Promise<boolean> {
  if ((presetScope !== "project" && presetScope !== "both") || !confirmProjectPresets || !ctx.hasUI) {
    return true;
  }

  const projectPresetsRequested = confirmRequestedProjectPresets(params, presets);
  if (projectPresetsRequested.length === 0) return true;

  const names = projectPresetsRequested.map((preset) => preset.name).join(", ");
  const sourceDir = projectPresetsDir ?? "(unknown)";
  return await ctx.ui.confirm(
    "Run project-local presets?",
    `Presets: ${names}\nSource: ${sourceDir}\n\nProject presets are repo-controlled. Only continue for trusted repositories.`,
  );
}

function createDetailsFactory(
  mode: DelegateDetails["mode"],
  presetScope: PresetScope,
  projectPresetsDir: string | null,
): (results: SingleResult[]) => DelegateDetails {
  return (results) => ({ mode, presetScope, projectPresetsDir, results });
}

function formatModelLabel(overrides?: RunOverrides): string | undefined {
  if (!overrides?.model) {
    return undefined;
  }

  return `${overrides.model}:${overrides.thinking ?? "medium"}`;
}

function createRunningResult(
  preset: string,
  task: string,
  overrides?: RunOverrides,
): SingleResult {
  return {
    preset,
    presetSource: "unknown",
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
      return `${stepPrefix}${result.preset}: ${result.sessionId}`;
    });
  return lines.length > 0 ? `\n\nSession IDs:\n${lines.join("\n")}` : "";
}

function mergeRunOverrides(run: RunOverrides, defaults?: RunOverrides): RunOverrides {
  return {
    model: run.model ?? defaults?.model,
    thinking: run.thinking ?? defaults?.thinking,
  };
}

function buildSingleResultResponse(
  result: SingleResult,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
): DelegateToolResult {
  if (isResultError(result)) {
    return {
      content: [
        {
          type: "text",
          text: `Preset ${result.stopReason || "failed"}: ${getResultOutput(result)}${formatSessionLine(result)}`,
        },
      ],
      details: makeDetails([result]),
    };
  }

  return {
    content: [
      {
        type: "text",
        text: (getFinalOutput(result.messages) || "(no output)") + formatSessionLine(result),
      },
    ],
    details: makeDetails([result]),
  };
}

async function executeSequenceMode(
  ctx: { cwd: string },
  params: { sequence: DelegateRunRequest[] },
  presets: PresetConfig[],
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
  defaultOverrides?: RunOverrides,
): Promise<DelegateToolResult> {
  const results: SingleResult[] = [];
  let previousOutput = "";

  for (let index = 0; index < params.sequence.length; index++) {
    const step = params.sequence[index];
    const taskWithContext = step.prompt.replace(/\{previous\}/g, previousOutput);
    const sequenceUpdate: OnUpdateCallback | undefined = onUpdate
      ? (partial) => {
        const currentResult = partial.details?.results[0];
        if (!currentResult) return;
        onUpdate({
          content: partial.content,
          details: makeDetails([...results, currentResult]),
        });
      }
      : undefined;

    const result = await runSingleDelegate(
      ctx.cwd,
      presets,
      step.name,
      taskWithContext,
      step.cwd,
      index + 1,
      signal,
      sequenceUpdate,
      makeDetails,
      mergeRunOverrides(step, defaultOverrides),
    );
    results.push(result);
    if (isResultError(result)) {
      return {
        content: [
          {
            type: "text",
            text: `Sequence stopped at step ${index + 1} (${step.name}): ${getResultOutput(result)}${
              formatSessionSummary(results)
            }`,
          },
        ],
        details: makeDetails(results),
      };
    }
    previousOutput = getFinalOutput(result.messages);
  }

  return {
    content: [
      {
        type: "text",
        text: (getFinalOutput(results[results.length - 1].messages) || "(no output)")
          + formatSessionSummary(results),
      },
    ],
    details: makeDetails(results),
  };
}

async function executeParallelMode(
  ctx: { cwd: string },
  params: { parallel: DelegateRunRequest[] },
  presets: PresetConfig[],
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
  defaultOverrides?: RunOverrides,
): Promise<DelegateToolResult> {
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
    createRunningResult(task.name, task.prompt, mergeRunOverrides(task, defaultOverrides))
  );

  function emitParallelUpdate(): void {
    if (!onUpdate) return;
    const running = allResults.filter((result) => result.exitCode === -1).length;
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
      const result = await runSingleDelegate(
        ctx.cwd,
        presets,
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
        mergeRunOverrides(task, defaultOverrides),
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
    const sessionSuffix = result.sessionId ? `\nSession ID: ${result.sessionId}` : "";
    return `[${result.preset}] ${status}: ${preview || "(no output)"}${sessionSuffix}`;
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
  params: DelegateRunRequest,
  presets: PresetConfig[],
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
): Promise<DelegateToolResult> {
  const result = await runSingleDelegate(
    ctx.cwd,
    presets,
    params.name,
    params.prompt,
    params.cwd,
    undefined,
    signal,
    onUpdate,
    makeDetails,
    { model: params.model, thinking: params.thinking },
  );
  return buildSingleResultResponse(result, makeDetails);
}

async function executeResumeMode(
  params: {
    sessionId: string;
    prompt: string;
  },
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdateCallback | undefined,
  makeDetails: (results: SingleResult[]) => DelegateDetails,
  ctx: DelegateToolContext,
  confirmProjectPresets: boolean,
): Promise<DelegateToolResult> {
  const metadata = loadDelegateSession(params.sessionId);
  if (!metadata) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown delegate session: ${params.sessionId}\n`
            + "No saved delegate metadata was found for this session ID.",
        },
      ],
      details: makeDetails([]),
    };
  }

  // Check for project-local preset confirmation in resume mode
  if (confirmProjectPresets && ctx.hasUI && metadata.presetSource === "project") {
    const confirmed = await ctx.ui.confirm(
      "Run project-local preset from resumed session?",
      `Preset: ${metadata.preset}\nSource: project\nSession: ${params.sessionId}\n\nProject presets are repo-controlled. Only continue for trusted repositories.`,
    );
    if (!confirmed) {
      return {
        content: [
          {
            type: "text",
            text: "Canceled: project-local preset not approved for resumed session.",
          },
        ],
        details: makeDetails([]),
      };
    }
  }

  const result = await resumeDelegateSession(
    metadata,
    params.prompt,
    undefined,
    signal,
    onUpdate,
    makeDetails,
  );
  return buildSingleResultResponse(result, makeDetails);
}

export async function executeDelegateTool(
  params: DelegateToolParamsShape,
  signal: AbortSignal | undefined,
  onUpdate: ToolUpdateCallback | undefined,
  ctx: DelegateToolContext,
): Promise<DelegateToolResult> {
  const presetScope: PresetScope = params.options?.scope ?? "user";
  const discovery = discoverPresets(ctx.cwd, presetScope);
  const presets = discovery.presets;
  const confirmProjectPresets = params.options?.confirmProject ?? true;
  const hasSequence = (params.sequence?.length ?? 0) > 0;
  const hasParallel = (params.parallel?.length ?? 0) > 0;
  const hasSingle = Boolean(params.name && params.prompt);
  const hasResume = Boolean(params.sessionId && params.prompt);
  const modeCount = Number(hasSequence) + Number(hasParallel) + Number(hasSingle) + Number(hasResume);
  const currentMode = getCurrentMode(hasSequence, hasParallel, hasResume);
  const detailsForMode = (mode: DelegateDetails["mode"]) =>
    createDetailsFactory(mode, presetScope, discovery.projectPresetsDir);

  if (modeCount !== 1) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid parameters. Provide exactly one mode.\nAvailable presets: ${getAvailablePresetsText(presets)}`,
        },
      ],
      details: detailsForMode("single")([]),
    };
  }

  const approved = await confirmProjectPresetsIfNeeded(
    ctx,
    presetScope,
    confirmProjectPresets,
    presets,
    discovery.projectPresetsDir,
    params,
  );
  if (!approved) {
    return {
      content: [
        {
          type: "text",
          text: "Canceled: project-local presets not approved.",
        },
      ],
      details: detailsForMode(currentMode)([]),
    };
  }

  if (params.sequence?.length) {
    return await executeSequenceMode(
      ctx,
      { sequence: params.sequence },
      presets,
      signal,
      onUpdate,
      detailsForMode("sequence"),
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
      presets,
      signal,
      onUpdate,
      detailsForMode("parallel"),
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
      presets,
      signal,
      onUpdate,
      detailsForMode("single"),
    );
  }
  if (params.sessionId && params.prompt) {
    return await executeResumeMode(
      { sessionId: params.sessionId, prompt: params.prompt },
      signal,
      onUpdate,
      detailsForMode("resume"),
      ctx,
      confirmProjectPresets,
    );
  }

  return {
    content: [
      {
        type: "text",
        text: `Invalid parameters. Available presets: ${getAvailablePresetsText(presets)}`,
      },
    ],
    details: detailsForMode("single")([]),
  };
}
