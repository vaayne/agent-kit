/**
 * Simple MCP Client - Connects to mh server via stdio transport.
 */
import { VERSION } from "@mariozechner/pi-coding-agent";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export class MCPClient {
  private configPath: string;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.transport = new StdioClientTransport({
      command: "mh",
      args: ["serve", "-t", "stdio", "-c", this.configPath],
      stderr: "pipe",
    });

    this.client = new Client(
      { name: "pi-mcp-client", version: VERSION },
      { capabilities: {} },
    );

    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    await this.transport?.close();
    this.client = null;
    this.transport = null;
  }

  async listTools(): Promise<Tool[]> {
    if (!this.client) throw new Error("Not connected");
    const result = await this.client.listTools();
    return result.tools;
  }

  /**
   * List backend tools by calling the MCP Hub's list builtin tool.
   * Returns tools from connected backend servers (not the builtin tools).
   */
  async listBackendTools(): Promise<{ name: string; description: string }[]> {
    if (!this.client) throw new Error("Not connected");
    const result = (await this.client.callTool({
      name: "list",
      arguments: {},
    })) as CallToolResult;

    // Parse the text output from list tool
    // Format: "Total: N tools\n\n- toolName: description\n- toolName2: description2\n..."
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const tools: { name: string; description: string }[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/^- ([^:]+): (.+)$/);
      if (match?.[1] && match[2]) {
        tools.push({ name: match[1].trim(), description: match[2].trim() });
      }
    }
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if (!this.client) throw new Error("Not connected");
    // Call backend tools through MCP Hub's invoke builtin tool
    return this.client.callTool({
      name: "invoke",
      arguments: { name, params: args },
    }) as Promise<CallToolResult>;
  }

  /**
   * Inspect a tool by calling the MCP Hub's inspect builtin tool.
   */
  async inspectTool(name: string): Promise<CallToolResult> {
    if (!this.client) throw new Error("Not connected");
    return this.client.callTool({
      name: "inspect",
      arguments: { name },
    }) as Promise<CallToolResult>;
  }
}
