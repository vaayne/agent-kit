/**
 * Powerline Status Line Extension
 *
 * A powerline-style status bar with segmented display showing:
 * - Mode indicator (idle/thinking/working)
 * - Model name with provider icon
 * - Token usage (input/output)
 * - Cost tracker
 * - Git branch
 * - Turn counter
 *
 * Uses powerline separators (,) for a sleek look.
 * Colors are theme-aware and update with theme changes.
 *
 * Usage: pi -e ~/.pi/agent/extensions/powerline-status.ts
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

// Powerline characters
const SEP_RIGHT = ""; // U+E0B0 - filled arrow pointing right
const SEP_RIGHT_THIN = ""; // U+E0B1 - thin arrow pointing right
const SEP_LEFT = ""; // U+E0B2 - filled arrow pointing left
const SEP_LEFT_THIN = ""; // U+E0B3 - thin arrow pointing left

// Provider icons (Nerd Font icons)
const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "󰛄", // Claude icon or generic AI
  openai: "󰧑", // OpenAI logo
  google: "󰊭", // Google logo
  deepseek: "󰭹", // Deep search
  mistral: "󱗃", // Wind/mistral
  openrouter: "󰒍", // Router icon
  default: "󰘦", // Generic AI/robot
};

type Mode = "idle" | "thinking" | "working" | "error";

type Segment = {
  text: string;
  fg: string; // ANSI fg color
  bg: string; // ANSI bg color
};

// ANSI color codes for powerline segments
const COLORS = {
  // Backgrounds (use 256-color mode for better compatibility)
  bgBlue: "\x1b[48;5;33m",
  bgGreen: "\x1b[48;5;34m",
  bgYellow: "\x1b[48;5;220m",
  bgOrange: "\x1b[48;5;208m",
  bgRed: "\x1b[48;5;196m",
  bgPurple: "\x1b[48;5;141m",
  bgGray: "\x1b[48;5;240m",
  bgDarkGray: "\x1b[48;5;236m",
  bgLightGray: "\x1b[48;5;245m",
  bgCyan: "\x1b[48;5;37m",
  bgMagenta: "\x1b[48;5;170m",
  bgReset: "\x1b[49m",

  // Foregrounds
  fgBlue: "\x1b[38;5;33m",
  fgGreen: "\x1b[38;5;34m",
  fgYellow: "\x1b[38;5;220m",
  fgOrange: "\x1b[38;5;208m",
  fgRed: "\x1b[38;5;196m",
  fgPurple: "\x1b[38;5;141m",
  fgGray: "\x1b[38;5;240m",
  fgDarkGray: "\x1b[38;5;236m",
  fgLightGray: "\x1b[38;5;245m",
  fgCyan: "\x1b[38;5;37m",
  fgMagenta: "\x1b[38;5;170m",
  fgWhite: "\x1b[38;5;255m",
  fgBlack: "\x1b[38;5;232m",
  fgReset: "\x1b[39m",

  // Style
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

// Convert bg color code to matching fg color code for separator
function bgToFg(bg: string): string {
  return bg.replace("\x1b[48;", "\x1b[38;");
}

// Build powerline string from segments (left-aligned)
function buildPowerlineLeft(segments: Segment[]): string {
  if (segments.length === 0) return "";

  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const nextSeg = segments[i + 1];

    // Segment content
    result += `${seg.bg}${seg.fg} ${seg.text} `;

    // Separator
    if (nextSeg) {
      // Separator: fg = current bg, bg = next bg
      result += `${nextSeg.bg}${bgToFg(seg.bg)}${SEP_RIGHT}`;
    } else {
      // Final separator: fg = current bg, bg = reset
      result += `${COLORS.bgReset}${bgToFg(seg.bg)}${SEP_RIGHT}`;
    }
  }

  return result + COLORS.reset;
}

// Build powerline string from segments (right-aligned)
function buildPowerlineRight(segments: Segment[]): string {
  if (segments.length === 0) return "";

  let result = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const prevSeg = segments[i - 1];

    // Leading separator
    if (i === 0) {
      result += `${bgToFg(seg.bg)}${SEP_LEFT}`;
    } else {
      result += `${seg.bg}${bgToFg(seg.bg)}${SEP_LEFT}`;
    }

    // Segment content
    result += `${seg.bg}${seg.fg} ${seg.text} `;
  }

  return result + COLORS.reset;
}

// Calculate visible width of powerline segments
function segmentsWidth(segments: Segment[]): number {
  let width = 0;
  for (const seg of segments) {
    width += visibleWidth(seg.text) + 2; // +2 for padding spaces
  }
  width += segments.length; // separators
  return width;
}

export default function(pi: ExtensionAPI) {
  let mode: Mode = "idle";
  let turnCount = 0;
  let currentModel = "";
  let currentProvider = "";
  let errorMessage = "";

  // Helper to format numbers
  const fmt = (n: number): string =>
    n < 1000 ? `${n}` : n < 1000000 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1000000).toFixed(2)}M`;

  // Get mode segment based on current state
  const getModeSegment = (): Segment => {
    switch (mode) {
      case "idle":
        return { text: "● IDLE", fg: COLORS.fgBlack, bg: COLORS.bgGreen };
      case "thinking":
        return { text: "◐ THINKING", fg: COLORS.fgBlack, bg: COLORS.bgYellow };
      case "working":
        return { text: "◉ WORKING", fg: COLORS.fgBlack, bg: COLORS.bgBlue };
      case "error":
        return { text: "✗ ERROR", fg: COLORS.fgWhite, bg: COLORS.bgRed };
    }
  };

  // Get provider icon
  const getProviderIcon = (provider: string): string => {
    return PROVIDER_ICONS[provider.toLowerCase()] || PROVIDER_ICONS.default!;
  };

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Initialize model info
    if (ctx.model) {
      currentModel = ctx.model.id;
      currentProvider = ctx.model.provider;
    }

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // Compute tokens from session
          let inputTokens = 0;
          let outputTokens = 0;
          let totalCost = 0;

          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              inputTokens += m.usage.input;
              outputTokens += m.usage.output;
              totalCost += m.usage.cost.total;
            }
          }

          // Get git branch
          const branch = footerData.getGitBranch();

          // Build left segments
          const leftSegments: Segment[] = [
            getModeSegment(),
            {
              text: `${getProviderIcon(currentProvider)} ${currentModel || "no model"}`,
              fg: COLORS.fgWhite,
              bg: COLORS.bgPurple,
            },
          ];

          // Add turn counter if there are turns
          if (turnCount > 0) {
            leftSegments.push({
              text: `󰑐 ${turnCount}`,
              fg: COLORS.fgWhite,
              bg: COLORS.bgDarkGray,
            });
          }

          // Build right segments
          const rightSegments: Segment[] = [];

          // Token usage
          if (inputTokens > 0 || outputTokens > 0) {
            rightSegments.push({
              text: `󰞒 ${fmt(inputTokens)} 󰞓 ${fmt(outputTokens)}`,
              fg: COLORS.fgWhite,
              bg: COLORS.bgCyan,
            });
          }

          // Cost
          if (totalCost > 0) {
            rightSegments.push({
              text: `󰄬 $${totalCost.toFixed(3)}`,
              fg: COLORS.fgBlack,
              bg: COLORS.bgGreen,
            });
          }

          // Git branch
          if (branch) {
            rightSegments.push({
              text: ` ${branch}`,
              fg: COLORS.fgWhite,
              bg: COLORS.bgMagenta,
            });
          }

          // Build the powerline strings
          const leftStr = buildPowerlineLeft(leftSegments);
          const rightStr = buildPowerlineRight(rightSegments);

          // Calculate spacing
          const leftWidth = segmentsWidth(leftSegments);
          const rightWidth = segmentsWidth(rightSegments);
          const padding = Math.max(0, width - leftWidth - rightWidth);

          // Combine with padding
          const line = leftStr + " ".repeat(padding) + rightStr;

          return [truncateToWidth(line, width)];
        },
      };
    });
  });

  pi.on("model_select", async (event, ctx) => {
    if (!ctx.hasUI) return;
    currentModel = event.model.id;
    currentProvider = event.model.provider;
  });

  pi.on("turn_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    turnCount++;
    mode = "thinking";
  });

  pi.on("tool_call", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    mode = "working";
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    mode = "idle";
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    mode = "idle";
  });

  pi.on("session_switch", async (event, ctx) => {
    if (!ctx.hasUI) return;
    if (event.reason === "new") {
      turnCount = 0;
      mode = "idle";
      errorMessage = "";
    }
  });

  // Register command to toggle powerline footer
  pi.registerCommand("powerline", {
    description: "Toggle powerline status bar (use /powerline off to restore default)",
    handler: async (args, ctx) => {
      if (args === "off") {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Default footer restored", "info");
      } else {
        ctx.ui.notify("Powerline footer is active. Use /powerline off to disable.", "info");
      }
    },
  });
}
