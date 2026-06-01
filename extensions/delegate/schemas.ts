import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";

export const MAX_PARALLEL_TASKS = 8;
export const MAX_CONCURRENCY = 4;

export const ThinkingLevelSchema = StringEnum(
  ["off", "minimal", "low", "medium", "high", "xhigh"] as const,
  {
    description: "Thinking level override: off, minimal, low, medium, high, or xhigh.",
  },
);

const DelegateRunItem = Type.Object({
  name: Type.String({ description: "Name of the preset to invoke" }),
  prompt: Type.String({ description: "Prompt to send to the preset" }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the delegate process" })),
  model: Type.Optional(Type.String({ description: "Model override for this run" })),
  thinking: Type.Optional(ThinkingLevelSchema),
});

const SequenceItem = Type.Object({
  name: Type.String({ description: "Name of the preset to invoke" }),
  prompt: Type.String({
    description: "Prompt with optional {previous} placeholder for prior output",
  }),
  cwd: Type.Optional(Type.String({ description: "Working directory for the delegate process" })),
  model: Type.Optional(Type.String({ description: "Model override for this step" })),
  thinking: Type.Optional(ThinkingLevelSchema),
});

export const PresetScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description: "Which preset directories to use. Default: \"user\". Use \"both\" to include project-local presets.",
  default: "user",
});

const DelegateOptions = Type.Object({
  scope: Type.Optional(PresetScopeSchema),
  confirmProject: Type.Optional(
    Type.Boolean({
      description: "Prompt before running project-local presets. Default: true.",
      default: true,
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the delegate process (single mode)",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Default model override for all runs in this tool call. Per-run model wins.",
    }),
  ),
  thinking: Type.Optional(ThinkingLevelSchema),
});

export const DelegateToolParams = Type.Object({
  name: Type.Optional(
    Type.String({
      description: "Name of the preset to invoke (for single run)",
    }),
  ),
  sessionId: Type.Optional(
    Type.String({
      description: "Saved delegate session ID to resume",
    }),
  ),
  prompt: Type.Optional(
    Type.String({
      description: "Prompt to send to the preset (for single run or resumed session)",
    }),
  ),
  parallel: Type.Optional(
    Type.Array(DelegateRunItem, {
      description: "Array of {name, prompt} for parallel execution",
    }),
  ),
  sequence: Type.Optional(
    Type.Array(SequenceItem, {
      description: "Array of {name, prompt} for sequential execution",
    }),
  ),
  options: Type.Optional(DelegateOptions),
});
