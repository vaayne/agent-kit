/**
 * MCP Extension for Pi
 *
 * Connects to MCP server via mh CLI and provides mcp_invoke tool to call MCP tools.
 *
 * Configuration: ~/.pi/agent/mcp.json
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPClient } from "./client.js";

type BackendTool = { name: string; description: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "mcp.json");
const EXEC_USAGE_PATH = path.join(__dirname, "exec-usage.md");

export default function mcpExtension(pi: ExtensionAPI) {
  let client: MCPClient | null = null;
  let builtinTools: Tool[] = [];
  let backendTools: BackendTool[] = [];

  // Lazy initialization state
  let initPromise: Promise<boolean> | null = null;
  let isInitialized = false;

  async function initializeMCP(): Promise<boolean> {
    if (!fs.existsSync(CONFIG_PATH)) {
      return false;
    }

    // Check mh CLI
    const which = await pi.exec("which", ["mh"], { timeout: 5000 });
    if (which.code !== 0) {
      return false;
    }

    // Connect
    client = new MCPClient(CONFIG_PATH);
    try {
      await client.connect();

      // List builtin tools (from MCP protocol)
      builtinTools = await client.listTools();

      // List backend tools (from MCP Hub's list tool)
      backendTools = await client.listBackendTools();

      return true;
    } catch (err) {
      client = null;
      builtinTools = [];
      backendTools = [];
      return false;
    }
  }

  async function ensureConnected(): Promise<boolean> {
    if (isInitialized) return client !== null;

    if (!initPromise) {
      initPromise = initializeMCP();
    }

    const success = await initPromise;
    isInitialized = true;
    return success;
  }

  pi.on("session_start", async (_event, _ctx) => {
    // No-op: initialization is now lazy
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.notify("MCP: session_shutdown fired", "info");
    if (client) {
      ctx.ui.notify("MCP: disconnecting...", "info");
      await client.disconnect();
      ctx.ui.notify("MCP: disconnected", "info");
      client = null;
      builtinTools = [];
      backendTools = [];
    }
  });

  // Register mcp_list tool
  pi.registerTool({
    name: "mcp_list",
    label: "MCP List",
    description:
      "List all available MCP tools with names and brief descriptions. Use this to discover what tools are available.",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _onUpdate, _ctx, _signal) {
      if (!(await ensureConnected()) || backendTools.length === 0) {
        return {
          content: [
            { type: "text", text: "MCP not connected or no tools available" },
          ],
          details: {},
          isError: true,
        };
      }

      const toolList = backendTools
        .map((t) => {
          return `- ${t.name}: ${t.description || "No description"}`;
        })
        .join("\n");

      return {
        content: [
          { type: "text", text: `Available MCP tools:\n\n${toolList}` },
        ],
        details: { tools: backendTools.map((t) => t.name) },
      };
    },
  });

  // Register mcp_inspect tool
  pi.registerTool({
    name: "mcp_inspect",
    label: "MCP Inspect",
    description:
      "Show full tool signature as a JSDoc function stub. The output includes parameter types, required/optional markers, enum values, and defaults. Use this to understand how to call a tool before using mcp_invoke or mcp_exec.",
    parameters: Type.Object({
      tool: Type.String({ description: "Name of the MCP tool to inspect" }),
    }),

    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const { tool: toolName } = params as { tool: string };

      if (!(await ensureConnected())) {
        return {
          content: [{ type: "text", text: "MCP not connected" }],
          details: {},
          isError: true,
        };
      }

      // Check if tool exists in backend tools
      const tool = backendTools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown MCP tool: ${toolName}. Use mcp_list to see available tools.`,
            },
          ],
          details: {},
          isError: true,
        };
      }

      try {
        // Call MCP Hub's inspect builtin tool
        const result = await client!.inspectTool(toolName);
        const text = result.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("\n");

        return {
          content: [{ type: "text", text: text || "No schema available" }],
          details: { tool },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text", text: `Error inspecting ${toolName}: ${msg}` },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // Register mcp_invoke tool
  pi.registerTool({
    name: "mcp_invoke",
    label: "MCP Invoke",
    description:
      "Call a single MCP tool with JSON parameters. First use mcp_inspect to get the tool's signature, then invoke with the required parameters.",
    parameters: Type.Object({
      tool: Type.String({ description: "Name of the MCP tool to invoke" }),
      params: Type.Optional(
        Type.Unknown({
          description: "Parameters to pass to the tool as JSON object",
        }),
      ),
    }),

    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const { tool: toolName, params: toolParams } = params as {
        tool: string;
        params?: unknown;
      };

      if (!(await ensureConnected())) {
        return {
          content: [{ type: "text", text: "MCP not connected" }],
          details: {},
          isError: true,
        };
      }

      // Check if tool exists in backend tools
      const tool = backendTools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown MCP tool: ${toolName}. Use mcp_list to see available tools.`,
            },
          ],
          details: {},
          isError: true,
        };
      }

      try {
        // Handle case where params might be a JSON string
        let parsedParams: Record<string, unknown> = {};
        if (typeof toolParams === "string") {
          try {
            parsedParams = JSON.parse(toolParams);
          } catch {
            parsedParams = {};
          }
        } else if (toolParams && typeof toolParams === "object") {
          parsedParams = toolParams as Record<string, unknown>;
        }

        const result = await client!.callTool(toolName, parsedParams);

        // Extract text content from MCP result
        const text = result.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
          .join("\n");

        return {
          content: [{ type: "text", text: text || "Done" }],
          details: { mcpResult: result },
          isError: result.isError,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text", text: `Error calling ${toolName}: ${msg}` },
          ],
          details: {},
          isError: true,
        };
      }
    },
  });

  // Register mcp_exec tool
  pi.registerTool({
    name: "mcp_exec",
    label: "MCP Exec",
    description:
      `Execute JavaScript code to orchestrate multiple MCP tool calls with logic. IMPORTANT: Before using this tool, read the usage guide at ${EXEC_USAGE_PATH} to understand capabilities and limitations. Use mcp.callTool(name, params) to call tools. Supports async/await, variables, conditionals, loops, and chaining results.`,
    parameters: Type.Object({
      code: Type.String({
        description: "JavaScript code to execute. Use mcp.callTool(name, params) to call MCP tools.",
      }),
    }),

    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const { code } = params as { code: string };

      if (!(await ensureConnected())) {
        return {
          content: [{ type: "text", text: "MCP not connected" }],
          details: {},
          isError: true,
        };
      }

      try {
        // Create mcp object for the code to use
        const mcp = {
          callTool: async (
            name: string,
            toolParams: Record<string, unknown> = {},
          ) => {
            if (!client) {
              throw new Error("MCP client not connected");
            }
            const result = await client.callTool(name, toolParams);
            // Extract text content
            const text = result.content
              .filter((c) => c.type === "text")
              .map((c) => (c as { type: "text"; text: string }).text)
              .join("\n");
            return { text, content: result.content, isError: result.isError };
          },
          listTools: () =>
            backendTools.map((t) => ({
              name: t.name,
              description: t.description,
            })),
        };

        // Execute the code with mcp in scope
        const asyncFn = new Function(
          "mcp",
          `return (async () => { ${code} })()`,
        );
        const result = await asyncFn(mcp);

        const output = result !== undefined ? JSON.stringify(result, null, 2) : "Done";

        return {
          content: [{ type: "text", text: output }],
          details: { result },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error executing code: ${msg}` }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
