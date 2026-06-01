import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { AgentToolParams } from "./schemas.js";
import { executeAgentTool } from "./tool-execute.js";
import { renderToolCall, renderToolResult } from "./tool-render.js";

const AGENT_TOOL_DESCRIPTION = [
  "Delegate work to specialized agents with isolated context.",
  "Modes: single (name + prompt), resume (sessionId + prompt), parallel (parallel array), sequence (sequence array with {previous}).",
  "Default scope is \"user\" (from ~/.pi/agent/agents).",
  "To enable project-local agents in .pi/agents, set options.scope to \"both\" (or \"project\").",
  "You can override an agent's default model and thinking level at runtime via options.model/options.thinking or per-run fields.",
].join(" ");

export function registerAgentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "agent",
    label: "Agent",
    description: AGENT_TOOL_DESCRIPTION,
    parameters: AgentToolParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return await executeAgentTool(params, signal, onUpdate, ctx);
    },
    renderCall: renderToolCall,
    renderResult: renderToolResult,
  });
}
