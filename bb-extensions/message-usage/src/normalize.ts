import type { TokenUsageBreakdown } from "./thread-data.js";

export interface NormalizedUsage {
  /** Non-cached input tokens. */
  freshInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

/**
 * Providers disagree on whether `inputTokens` includes cached tokens:
 * OpenAI-style (codex) reports prompt tokens inclusive of cache, while
 * Anthropic-style (claude-code, pi) reports fresh input with cache separate.
 * `totalTokens` is the authoritative sum in both conventions, so compare it
 * against each candidate sum to detect which one is in play.
 */
export function normalizeBreakdown(
  breakdown: TokenUsageBreakdown | null | undefined,
): NormalizedUsage {
  if (!breakdown) {
    return {
      freshInputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
  }
  const { inputTokens, cachedInputTokens, outputTokens, totalTokens } = breakdown;
  const inclusiveSum = inputTokens + outputTokens;
  const separateSum = inclusiveSum + cachedInputTokens;
  const separateWins = cachedInputTokens > inputTokens
    || Math.abs(totalTokens - separateSum)
      <= Math.abs(totalTokens - inclusiveSum);
  return {
    freshInputTokens: separateWins
      ? inputTokens
      : Math.max(0, inputTokens - cachedInputTokens),
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens: breakdown.reasoningOutputTokens,
  };
}
