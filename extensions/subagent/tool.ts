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
  "Built-in agent: use name \"advisor\" to consult a stronger model for guidance on hard decisions (defaults to openai-codex/gpt-5.4 with xhigh thinking; override via PI_ADVISOR_MODEL and PI_ADVISOR_THINKING env vars).",
].join(" ");

export function registerAgentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "agent",
    label: "Agent",
    description: AGENT_TOOL_DESCRIPTION,
    promptGuidelines: [
      "Use the built-in \"advisor\" agent when stuck after 2+ failed attempts, before irreversible actions (deleting data, force-pushing, schema migrations), or when choosing between architecturally different approaches.",
      "When calling \"advisor\", always include: (1) what you are trying to do, (2) what you have tried and why it failed, (3) your specific question.",
      "Do not call \"advisor\" for straightforward tasks you can reason through yourself.",
    ],
    parameters: AgentToolParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return await executeAgentTool(params, signal, onUpdate, ctx);
    },
    renderCall: renderToolCall,
    renderResult: renderToolResult,
  });
}
