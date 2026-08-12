import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DelegateToolParams } from "./schemas.js";
import { executeDelegateTool } from "./tool-execute.js";
import { renderToolCall, renderToolResult } from "./tool-render.js";

const DELEGATE_TOOL_DESCRIPTION = [
  "Delegate work to specialized presets with isolated context.",
  "Modes: single (name + prompt), resume (sessionId + prompt), parallel (parallel array), sequence (sequence array with {previous}).",
  "Built-in presets live in the delegate extension. User presets can be added in ~/.pi/agent/delegate-presets.",
  "To enable project-local presets in .pi/delegate-presets, set options.scope to \"both\" (or \"project\").",
  "You can override a preset's default model and thinking level at runtime via options.model/options.thinking or per-run fields.",
].join(" ");

export function registerDelegateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: DELEGATE_TOOL_DESCRIPTION,
    parameters: DelegateToolParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return await executeDelegateTool(params, signal, onUpdate, ctx);
    },
    renderCall: renderToolCall,
    renderResult: renderToolResult,
  });
}
