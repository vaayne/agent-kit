import type { Message } from "@mariozechner/pi-ai";
import type { PresetScope } from "./presets.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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
  preset: string;
  presetSource: "preset" | "user" | "project" | "unknown";
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

export type DelegateDetails = {
  mode: "single" | "parallel" | "sequence" | "resume";
  presetScope: PresetScope;
  projectPresetsDir: string | null;
  results: SingleResult[];
};

export type SavedDelegateSession = {
  sessionId: string;
  preset: string;
  presetSource: "preset" | "user" | "project" | "unknown";
  cwd: string;
  model?: string;
  thinking?: ThinkingLevel;
  tools?: string[];
  systemPrompt: string;
};

export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };
