import type { PresetConfig } from "./presets.js";
import type { ThinkingLevel } from "./types.js";

export const MODEL_PROFILES = ["quick", "build", "reason", "design"] as const;

export type ModelProfile = (typeof MODEL_PROFILES)[number];

export type ResolvedModelSettings = {
  model?: string;
  thinking?: ThinkingLevel;
};

export function isModelProfile(value: string | undefined): value is ModelProfile {
  return MODEL_PROFILES.some((profile) => profile === value);
}

export function modelEnvName(profile: ModelProfile): string {
  return `PI_DELEGATE_${profile.toUpperCase()}_MODEL`;
}

export function thinkingEnvName(profile: ModelProfile): string {
  return `PI_DELEGATE_${profile.toUpperCase()}_THINKING`;
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envThinking(name: string): ThinkingLevel | undefined {
  const value = envValue(name);
  if (
    value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high"
    || value === "xhigh"
  ) {
    return value;
  }
  return undefined;
}

export function resolveProfileSettings(profile: ModelProfile | undefined): ResolvedModelSettings {
  if (!profile) return {};
  return {
    model: envValue(modelEnvName(profile)),
    thinking: envThinking(thinkingEnvName(profile)),
  };
}

export function missingModelEnvProfiles(presets: PresetConfig[]): ModelProfile[] {
  const missing = new Set<ModelProfile>();
  for (const preset of presets) {
    if (preset.modelProfile && !envValue(modelEnvName(preset.modelProfile))) {
      missing.add(preset.modelProfile);
    }
  }
  return MODEL_PROFILES.filter((profile) => missing.has(profile));
}

export function formatMissingModelEnvWarning(missingProfiles: ModelProfile[]): string {
  const exports = missingProfiles.map((profile) => `  export ${modelEnvName(profile)}="<model>"`).join("\n");
  return [
    `Delegate model env is not configured for profile(s): ${missingProfiles.join(", ")}.`,
    "",
    "Delegate presets using these profiles will use pi's default model unless a model is passed in the delegate tool call.",
    "",
    "Set them with:",
    exports,
    "",
    "Optional thinking env uses the same profile name, e.g.:",
    `  export ${thinkingEnvName(missingProfiles[0])}="medium"`,
  ].join("\n");
}
