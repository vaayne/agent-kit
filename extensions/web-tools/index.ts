/**
 * Web Tools Extension for Pi
 *
 * Provides web-fetch and web-search tools.
 *
 * Environment variables:
 * - EXA_API_KEY: Optional, for authenticated Exa API access
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { type FetchFormat, fetchHtml, fetchJson, fetchMarkdown, type FetchResult, fetchText } from "./fetcher.js";
import { search } from "./searcher.js";

export default function webToolsExtension(pi: ExtensionAPI) {
  // Register web-fetch tool
  pi.registerTool({
    name: "web-fetch",
    label: "Web Fetch",
    description:
      "Fetch and extract content from a URL. Returns content in the specified format (markdown by default). Useful for reading web pages, articles, documentation, etc.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      format: Type.Optional(
        Type.Union(
          [
            Type.Literal("markdown"),
            Type.Literal("text"),
            Type.Literal("html"),
            Type.Literal("json"),
          ],
          {
            description: "Output format: markdown (default), text, html, or json",
            default: "markdown",
          },
        ),
      ),
      headers: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: "Optional custom headers for the request",
        }),
      ),
    }),

    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const {
        url,
        format = "markdown",
        headers,
      } = params as {
        url: string;
        format?: FetchFormat;
        headers?: Record<string, string>;
      };

      // Validate URL
      try {
        new URL(url);
      } catch {
        return {
          content: [{ type: "text", text: `Invalid URL: ${url}` }],
          details: {},
          isError: true,
        };
      }

      const fetchParams = { url, headers };

      let result: FetchResult;
      switch (format) {
        case "html":
          result = await fetchHtml(fetchParams);
          break;
        case "json":
          result = await fetchJson(fetchParams);
          break;
        case "text":
          result = await fetchText(fetchParams);
          break;
        default:
          result = await fetchMarkdown(fetchParams);
          break;
      }

      return {
        content: [{ type: "text", text: result.content }],
        details: { url, format },
        isError: result.isError,
      };
    },
  });

  // Register web-search tool
  pi.registerTool({
    name: "web-search",
    label: "Web Search",
    description:
      "Search the web using Exa AI. Returns relevant search results with titles, URLs, and content snippets.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      numResults: Type.Optional(
        Type.Number({
          description: "Number of results to return (default: 8)",
          default: 8,
          minimum: 1,
          maximum: 20,
        }),
      ),
    }),

    async execute(_toolCallId, params, _onUpdate, _ctx, _signal) {
      const { query, numResults = 8 } = params as {
        query: string;
        numResults?: number;
      };

      const apiKey = process.env.EXA_API_KEY;
      const response = await search(query, numResults, apiKey);

      if (response.isError) {
        return {
          content: [{ type: "text", text: response.error || "Search failed" }],
          details: {},
          isError: true,
        };
      }

      // Format results as readable text
      const formattedResults = response.results
        .map((r, i) => {
          let entry = `## ${i + 1}. ${r.title}\n`;
          entry += `**URL:** ${r.url}\n`;
          if (r.publishedDate) {
            entry += `**Published:** ${r.publishedDate}\n`;
          }
          if (r.text) {
            entry += `\n${r.text}\n`;
          }
          return entry;
        })
        .join("\n---\n\n");

      const output =
        `# Search Results for: "${query}"\n\nFound ${response.results.length} results.\n\n${formattedResults}`;

      return {
        content: [{ type: "text", text: output }],
        details: { query, resultCount: response.results.length },
        isError: false,
      };
    },
  });
}
