/**
 * Rule file scanner utilities.
 *
 * Scans `.claude/rules/`, `.agents/rules/`, and root-level rule files
 * (CLAUDE.md, AGENTS.md) for project rules.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** A discovered rule file with its source and path info. */
export type RuleFile = {
  /** Which source directory this rule came from */
  source: ".claude/rules" | ".agents/rules";
  /** Path relative to the source (e.g., "testing.md" or "frontend/components.md") */
  relativePath: string;
  /** Full absolute path to the rule file */
  absolutePath: string;
  /** Display path relative to cwd (e.g., ".claude/rules/testing.md") */
  displayPath: string;
};

/** Result of scanning a project for rules. */
export type ScanResult = {
  /** All discovered rule files */
  rules: RuleFile[];
  /** Directories that were scanned */
  scannedDirs: string[];
};

/**
 * Recursively find all .md files in a directory.
 */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      for (const nested of findMarkdownFiles(fullPath)) {
        results.push(path.join(entry.name, nested));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(entry.name);
    }
  }

  return results;
}

/**
 * Scan a rules directory and return discovered rule files.
 */
function scanRulesDir(
  cwd: string,
  dirRelative: string,
  source: RuleFile["source"],
): RuleFile[] {
  const dir = path.join(cwd, dirRelative);
  const mdFiles = findMarkdownFiles(dir);

  return mdFiles.map((relativePath) => ({
    source,
    relativePath,
    absolutePath: path.join(dir, relativePath),
    displayPath: `${dirRelative}/${relativePath}`,
  }));
}

/** Rule directory paths relative to project root. */
const RULE_DIRS: { path: string; source: RuleFile["source"] }[] = [
  { path: ".claude/rules", source: ".claude/rules" },
  { path: ".agents/rules", source: ".agents/rules" },
];

/**
 * Scan a project directory for all rule sources.
 *
 * Checks:
 * - `.claude/rules/` — Claude Code rule files
 * - `.agents/rules/` — Agent rule files
 */
export function scanProjectRules(cwd: string): ScanResult {
  const rules: RuleFile[] = [];
  const scannedDirs: string[] = [];

  for (const dir of RULE_DIRS) {
    const dirPath = path.join(cwd, dir.path);
    scannedDirs.push(dir.path);

    if (fs.existsSync(dirPath)) {
      rules.push(...scanRulesDir(cwd, dir.path, dir.source));
    }
  }

  return { rules, scannedDirs };
}
