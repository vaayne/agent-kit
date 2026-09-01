import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { normalizeBreakdown } from "./normalize.js";
import { estimateCostUsd, fallbackPricing, lookupPricing, type ModelPricing } from "./pricing.js";
import { TurnUsageTracker } from "./turn-usage.js";
import {
  fetchAcceptedTurnRequest,
  fetchLastCompletedTurn,
  fetchLatestAssistantRow,
  fetchLatestUsageEvent,
} from "./thread-data.js";

const normalizedBreakdownSchema = z.object({
  freshInputTokens: z.number(),
  cachedInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
});

/**
 * Wire shape of one usage report. Sourced live from the thread's event
 * history on every call — bb prunes old `thread/tokenUsage/updated` events
 * itself (only the latest one or two survive), so this plugin deliberately
 * persists nothing and mirrors that "latest only" semantics.
 *
 * All token fields are provider-normalized: `freshInputTokens` never
 * includes cached tokens regardless of the provider's reporting convention.
 */
const usageReportSchema = z.object({
  /** Per-turn token consumption (sum across the turn's model calls). */
  last: normalizedBreakdownSchema.nullable(),
  /** Whether `last` is a true per-turn sum (false = newest call only). */
  lastIsTurnSum: z.boolean(),
  /** Cumulative thread totals reported alongside the latest call. */
  total: normalizedBreakdownSchema.nullable(),
  /** Tokens per second derived from the last turn's wall-clock span. */
  outputTokensPerSecond: z.number().nullable(),
  /** Model that executed the latest turn, when it can be resolved. */
  model: z.string().nullable(),
  /** Estimated cost of the latest call in US dollars (not a bill). */
  estimatedCostUsd: z.number().nullable(),
  /** True when the estimate came from a fallback default price. */
  costIsEstimate: z.boolean(),
  /** Timeline row id of the message this report belongs to (null when unknown). */
  messageRowId: z.string().nullable(),
});

export type UsageReport = z.infer<typeof usageReportSchema>;

export const messageUsageRpc = defineRpcContract({
  getUsage: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: usageReportSchema,
  },
});

/**
 * Wall-clock tokens/s from the last completed turn. This is a turn-level
 * figure (includes tool round-trips), not a pure decode rate — good enough
 * for a badge, deliberately.
 */
function computeTokensPerSecond(
  outputTokens: number,
  durationMs: number | null,
): number | null {
  if (durationMs === null || durationMs <= 0 || outputTokens <= 0) return null;
  const seconds = durationMs / 1000;
  return Math.round((outputTokens / seconds) * 10) / 10;
}

export default function plugin(bb: BbPluginApi) {
  const turnTracker = new TurnUsageTracker();
  bb.rpc.register(messageUsageRpc, {
    async getUsage({ threadId }) {
      // Unknown or deleted threads report "no data" rather than erroring —
      // the badge simply stays hidden.
      let usageEvent: Awaited<ReturnType<typeof fetchLatestUsageEvent>>;
      let assistantRow: Awaited<ReturnType<typeof fetchLatestAssistantRow>>;
      let lastTurn: Awaited<ReturnType<typeof fetchLastCompletedTurn>>;
      try {
        [usageEvent, assistantRow, lastTurn] = await Promise.all([
          fetchLatestUsageEvent(bb, threadId),
          fetchLatestAssistantRow(bb, threadId),
          fetchLastCompletedTurn(bb, threadId),
        ]);
      } catch (error) {
        bb.log.warn(
          `getUsage(${threadId}) degraded to empty: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          last: null,
          lastIsTurnSum: false,
          total: null,
          outputTokensPerSecond: null,
          model: null,
          estimatedCostUsd: null,
          costIsEstimate: false,
          messageRowId: null,
        };
      }

      if (!usageEvent) {
        return {
          last: null,
          lastIsTurnSum: false,
          total: null,
          outputTokensPerSecond: null,
          model: null,
          estimatedCostUsd: null,
          costIsEstimate: false,
          messageRowId: assistantRow?.rowId ?? null,
        };
      }

      // Model provenance: accepted turn id -> the originating client request
      // -> its recorded execution options. Missing links degrade to null.
      const accepted = usageEvent.turnId
        ? await fetchAcceptedTurnRequest(bb, threadId, usageEvent.turnId, usageEvent.seq)
        : null;
      const model = accepted?.model ?? null;

      // Provider conventions disagree on whether inputTokens includes cached
      // tokens; normalize here so the frontend never guesses. The tracker
      // diffs cumulative totals across turn boundaries so `perTurn` sums
      // every model call in the turn, not just the newest one.
      const { perTurn, last } = turnTracker.observe(threadId, usageEvent);
      const total = normalizeBreakdown(usageEvent.tokenUsage.total);
      const turnUsage = perTurn ?? last;

      // Pricing: models.dev catalog first, built-in fallback table last.
      // The fallback is a placeholder, so its results are flagged with "~".
      let pricing: ModelPricing | null = model
        ? await lookupPricing(bb, model)
        : null;
      let costIsEstimate = false;
      if (!pricing) {
        pricing = fallbackPricing();
        costIsEstimate = true;
      }
      const estimatedCostUsd = pricing
        ? estimateCostUsd(pricing, {
          inputTokens: turnUsage.freshInputTokens,
          cachedInputTokens: turnUsage.cachedInputTokens,
          outputTokens: turnUsage.outputTokens,
        })
        : null;

      return {
        last: turnUsage,
        lastIsTurnSum: perTurn?.isSum ?? false,
        total,
        outputTokensPerSecond: computeTokensPerSecond(
          turnUsage.outputTokens,
          lastTurn?.durationMs ?? null,
        ),
        model,
        estimatedCostUsd,
        costIsEstimate,
        messageRowId: assistantRow?.rowId ?? null,
      };
    },
  });
}
