import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { PresetScope } from "./presets.js";
import type { DelegateDetails, ThinkingLevel } from "./types.js";

export type ToolUpdateCallback = (partial: AgentToolResult<DelegateDetails>) => void;

export type ThemeLike = {
  fg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

export type RenderableResult = {
  details?: unknown;
  content: Array<{ type: string; text?: string }>;
};

export type RenderableArgs = {
  options?: {
    scope?: PresetScope;
    model?: string;
    thinking?: ThinkingLevel;
  };
  sequence?: Array<{
    name: string;
    prompt: string;
    model?: string;
    thinking?: ThinkingLevel;
  }>;
  parallel?: Array<{
    name: string;
    prompt: string;
    model?: string;
    thinking?: ThinkingLevel;
  }>;
  name?: string;
  sessionId?: string;
  prompt?: string;
  model?: string;
  thinking?: ThinkingLevel;
};
