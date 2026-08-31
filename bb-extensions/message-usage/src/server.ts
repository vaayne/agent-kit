import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { estimateCostUsd, type ModelPricing, parseModelPricing } from "./pricing.js";
import {
  fetchAcceptedTurnRequest,
  fetchLastCompletedTurn,
  fetchLatestAssistantRow,
  fetchLatestUsageEvent,
  type TokenUsageBreakdown,
} from "./thread-data.js";

/**
 * Wire shape of one usage report. Sourced live from the thread's event
 * history on every call — bb prunes old `thread/tokenUsage/updated` events
 * itself (only the latest one or two survive), so this plugin deliberately
 * persists nothing and mirrors that "latest only" semantics.
 */
const usageReportSchema = z.object({
  /** Per-request token counts of the latest completed model call. */
  last: z
    .object({
      inputTokens: z.number(),
      cachedInputTokens: z.number(),
      outputTokens: z.number(),
      reasoningOutputTokens: z.number(),
      totalTokens: z.number(),
    })
    .nullable(),
  /** Cumulative thread totals reported alongside the latest call. */
  total: z
    .object({
      inputTokens: z.number(),
      cachedInputTokens: z.number(),
      outputTokens: z.number(),
      reasoningOutputTokens: z.number(),
      totalTokens: z.number(),
    })
    .nullable(),
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

function breakdownOrZero(
  value: TokenUsageBreakdown | null | undefined,
): NonNullable<UsageReport["last"]> {
  return {
    inputTokens: value?.inputTokens ?? 0,
    cachedInputTokens: value?.cachedInputTokens ?? 0,
    outputTokens: value?.outputTokens ?? 0,
    reasoningOutputTokens: value?.reasoningOutputTokens ?? 0,
    totalTokens: value?.totalTokens ?? 0,
  };
}

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
        ? await fetchAcceptedTurnRequest(bb, threadId, usageEvent.turnId)
        : null;
      let model: string | null = accepted?.model ?? null;

      // Cache rate uses the non-cached input portion as the denominator so
      // the number reads as "how much of this call hit the cache".
      const last = breakdownOrZero(usageEvent.tokenUsage.last);
      const total = breakdownOrZero(usageEvent.tokenUsage.total);
      const freshInput = Math.max(0, last.inputTokens - last.cachedInputTokens);
      const cacheRatePct = last.cachedInputTokens > 0 && freshInput + last.cachedInputTokens > 0
        ? last.cachedInputTokens / (freshInput + last.cachedInputTokens)
        : null;

      let pricing: ModelPricing | null = model
        ? parseModelPricing(model)
        : null;
      let costIsEstimate = false;
      if (!pricing) {
        pricing = parseModelPricing("default");
        costIsEstimate = pricing !== null;
      }
      const estimatedCostUsd = pricing
        ? estimateCostUsd(pricing, {
          inputTokens: freshInput,
          cachedInputTokens: last.cachedInputTokens,
          outputTokens: last.outputTokens,
        })
        : null;

      void cacheRatePct; // computed client-side from the breakdown; kept for future server use

      return {
        last,
        total,
        outputTokensPerSecond: computeTokensPerSecond(
          last.outputTokens,
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
