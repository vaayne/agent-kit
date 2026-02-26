/**
 * Rules Extension for Pi
 *
 * Scans the project for rule files in multiple locations and lists them
 * in the system prompt. The agent can then use the read tool to load
 * specific rules when needed.
 *
 * Scanned locations:
 * - .claude/rules/  — Claude Code rule files
 * - .agents/rules/  — Agent rule files
 *
 * Best practices:
 * - Keep rules focused: each file should cover one topic
 * - Use descriptive filenames: the name should indicate what the rules cover
 * - Organize with subdirectories: group related rules (e.g., frontend/, backend/)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { type RuleFile, type ScanResult, scanProjectRules } from "./scanner.js";


function formatRulesForPrompt(scan: ScanResult): string {
  if (scan.rules.length === 0) {
    return "";
  }

  // Group rules by source directory
  const bySource = new Map<string, RuleFile[]>();
  for (const rule of scan.rules) {
    const existing = bySource.get(rule.source) ?? [];
    existing.push(rule);
    bySource.set(rule.source, existing);
  }

  const sections: string[] = [];
  for (const [source, rules] of bySource) {
    const list = rules.map((r) => `- ${r.displayPath}`).join("\n");
    sections.push(`Rules in ${source}/:\n${list}`);
  }

  return sections.join("\n\n");
}

export default function rulesExtension(pi: ExtensionAPI) {
  let scanResult: ScanResult = { rules: [], scannedDirs: [] };

  // Scan for rules on session start
  pi.on("session_start", async (_event, ctx) => {
    scanResult = scanProjectRules(ctx.cwd);

    if (scanResult.rules.length > 0) {
      const sources = new Set(scanResult.rules.map((r) => r.source));
      const sourceList = [...sources].join(", ");
      ctx.ui.notify(
        `Found ${scanResult.rules.length} rule(s) from: ${sourceList}`,
        "info",
      );
    }
  });

  // Append available rules to system prompt
  pi.on("before_agent_start", async (event) => {
    if (scanResult.rules.length === 0) {
      return;
    }

    const rulesSection = formatRulesForPrompt(scanResult);

    return {
      systemPrompt:
        `${event.systemPrompt}

## Project Rules

The following project rules are available:

${rulesSection}

When working on tasks related to these rules, use the read tool to load the relevant rule files for guidance.
`,
    };
  });
}
