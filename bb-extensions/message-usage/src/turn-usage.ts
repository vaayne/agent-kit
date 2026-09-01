import { normalizeBreakdown, type NormalizedUsage } from "./normalize.js";
import type { LatestUsageEvent } from "./thread-data.js";

export interface TurnUsage {
  freshInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  /** False when derived from a single-call fallback (may undercount multi-call turns). */
  isSum: boolean;
}

interface ThreadUsageState {
  lastTurnId: string | null;
  /** Cumulative totals observed at the end of the previous turn. */
  baseline: NormalizedUsage | null;
  /** First usage event seen within the current turn (for start-baseline). */
  turnStartBaseline: NormalizedUsage | null;
  turnStartSeen: boolean;
}

/**
 * Derives per-turn consumption from the cumulative totals the provider
 * reports. A turn with several model calls (tool round-trips) emits one
 * usage event per call; `last` only reflects the newest call, so accurate
 * per-turn numbers are the difference of the cumulative totals across the
 * turn boundary. Events are pruned to the newest one or two, so the diff
 * baseline must be captured live — cold reads (after reload) fall back to
 * the latest call and say so.
 */
export class TurnUsageTracker {
  private readonly states = new Map<string, ThreadUsageState>();

  constructor(private readonly maxThreads = 500) {}

  observe(
    threadId: string,
    event: LatestUsageEvent,
  ): { perTurn: TurnUsage | null; last: NormalizedUsage } {
    const last = normalizeBreakdown(event.tokenUsage.last);
    const total = normalizeBreakdown(event.tokenUsage.total);
    const state = this.states.get(threadId) ?? {
      lastTurnId: null,
      baseline: null,
      turnStartBaseline: null,
      turnStartSeen: false,
    };

    let perTurn: TurnUsage | null = null;
    const isNewTurn = event.turnId !== null && event.turnId !== state.lastTurnId;

    if (isNewTurn) {
      // Baseline for the new turn: the previous turn's ending totals. If we
      // never saw the previous turn end, the oldest observation this turn
      // minus its own `last` is the best approximation (correct when the
      // turn has a single call, the common case for badge-worthy replies).
      const startBaseline =
        state.baseline ??
        (total && last
          ? {
            freshInputTokens: Math.max(0, total.freshInputTokens - last.freshInputTokens),
            cachedInputTokens: Math.max(0, total.cachedInputTokens - last.cachedInputTokens),
            outputTokens: Math.max(0, total.outputTokens - last.outputTokens),
            reasoningOutputTokens: Math.max(
              0,
              total.reasoningOutputTokens - last.reasoningOutputTokens,
            ),
          }
          : null);
      state.lastTurnId = event.turnId;
      state.turnStartBaseline = startBaseline;
      state.turnStartSeen = startBaseline !== null;
      state.baseline = null;
    }

    if (total && state.turnStartSeen && state.turnStartBaseline) {
      perTurn = {
        freshInputTokens: Math.max(0, total.freshInputTokens - state.turnStartBaseline.freshInputTokens),
        cachedInputTokens: Math.max(0, total.cachedInputTokens - state.turnStartBaseline.cachedInputTokens),
        outputTokens: Math.max(0, total.outputTokens - state.turnStartBaseline.outputTokens),
        reasoningOutputTokens: Math.max(
          0,
          total.reasoningOutputTokens - state.turnStartBaseline.reasoningOutputTokens,
        ),
        isSum: true,
      };
      state.baseline = total;
    } else {
      // No usable cumulative baseline (cold read): report the newest call.
      perTurn = last
        ? {
          freshInputTokens: last.freshInputTokens,
          cachedInputTokens: last.cachedInputTokens,
          outputTokens: last.outputTokens,
          reasoningOutputTokens: last.reasoningOutputTokens,
          isSum: false,
        }
        : null;
    }

    // Bound memory: drop the oldest entries in insertion order.
    if (!this.states.has(threadId) && this.states.size >= this.maxThreads) {
      const oldest = this.states.keys().next().value;
      if (oldest !== undefined) this.states.delete(oldest);
    }
    this.states.set(threadId, state);
    return { perTurn, last };
  }
}
