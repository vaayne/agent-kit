/**
 * Delegate preset discovery and configuration
 */

import { parseFrontmatter } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isModelProfile, type ModelProfile } from "./model-env.js";
import type { ThinkingLevel } from "./types.js";

export type PresetScope = "user" | "project" | "both";

export type PresetConfig = {
  name: string;
  description: string;
  tools?: string[];
  modelProfile?: ModelProfile;
  thinking?: ThinkingLevel;
  systemPrompt: string;
  source: "preset" | "user" | "project";
  filePath: string;
};

export type PresetDiscoveryResult = {
  presets: PresetConfig[];
  projectPresetsDir: string | null;
};

function loadPresetsFromDir(dir: string, source: "preset" | "user" | "project"): PresetConfig[] {
  const presets: PresetConfig[] = [];

  if (!fs.existsSync(dir)) {
    return presets;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return presets;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<{
      name?: string;
      description?: string;
      tools?: string;
      modelProfile?: string;
      thinking?: ThinkingLevel;
    }>(content);

    if (!frontmatter.name || !frontmatter.description) {
      continue;
    }

    const tools = frontmatter.tools
      ?.split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);

    presets.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      modelProfile: isModelProfile(frontmatter.modelProfile) ? frontmatter.modelProfile : undefined,
      thinking: frontmatter.thinking,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return presets;
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findNearestProjectPresetsDir(cwd: string): string | null {
  let currentDir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(currentDir, ".pi", "delegate-presets");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

export function discoverPresets(cwd: string, scope: PresetScope): PresetDiscoveryResult {
  const presetDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "presets");
  const userDir = path.join(os.homedir(), ".pi", "agent", "delegate-presets");
  const projectPresetsDir = findNearestProjectPresetsDir(cwd);

  const builtInPresets = loadPresetsFromDir(presetDir, "preset");
  const userPresets = scope === "project" ? [] : loadPresetsFromDir(userDir, "user");
  const projectPresets = scope === "user" || !projectPresetsDir ? [] : loadPresetsFromDir(projectPresetsDir, "project");

  const presetMap = new Map<string, PresetConfig>();
  for (const preset of builtInPresets) presetMap.set(preset.name, preset);

  if (scope === "both") {
    for (const preset of userPresets) presetMap.set(preset.name, preset);
    for (const preset of projectPresets) presetMap.set(preset.name, preset);
  } else if (scope === "user") {
    for (const preset of userPresets) presetMap.set(preset.name, preset);
  } else {
    for (const preset of projectPresets) presetMap.set(preset.name, preset);
  }

  return { presets: Array.from(presetMap.values()), projectPresetsDir };
}

export function formatPresetList(
  presets: PresetConfig[],
  maxItems: number,
): { text: string; remaining: number } {
  if (presets.length === 0) return { text: "none", remaining: 0 };
  const listed = presets.slice(0, maxItems);
  const remaining = presets.length - listed.length;
  return {
    text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
    remaining,
  };
}
