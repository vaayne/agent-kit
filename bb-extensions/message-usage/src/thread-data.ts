import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * Reads the "latest only" usage surface from a thread's event history via
 * `bb.sdk.threads.events.list`. bb prunes old token-usage events itself, so
 * every query here targets the tail of the history and persists nothing.
 */

export interface TokenUsageBreakdown {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface LatestUsageEvent {
  turnId: string | null;
  seq: number;
  tokenUsage: {
    total: TokenUsageBreakdown | null;
    last: TokenUsageBreakdown | null;
  };
}

/** Latest assistant conversation row, for anchoring the badge in the UI. */
export interface LatestAssistantRow {
  rowId: string;
  turnId: string | null;
}

export interface LastCompletedTurn {
  durationMs: number | null;
}

type Bb = BbPluginApi;

const EVENT_TYPES = {
  tokenUsage: "thread/tokenUsage/updated",
  turnCompleted: "turn/completed",
  turnStarted: "turn/started",
  turnInputAccepted: "turn/input/accepted",
  clientTurnRequested: "client/turn/requested",
} as const;

function eventTypes<K extends keyof typeof EVENT_TYPES>(
  ...keys: readonly [K, ...K[]]
): readonly [string, ...string[]] {
  return keys.map((key) => EVENT_TYPES[key]) as unknown as readonly [
    string,
    ...string[],
  ];
}

export async function fetchLatestUsageEvent(
  bb: Bb,
  threadId: string,
): Promise<LatestUsageEvent | null> {
  const rows = await bb.sdk.threads.events.list({
    threadId,
    types: eventTypes("tokenUsage") as never,
    order: "desc",
    limit: "1",
  });
  const row = rows[0];
  if (!row || row.type !== "thread/tokenUsage/updated") return null;
  const data = row.data as {
    tokenUsage?: {
      total?: TokenUsageBreakdown | null;
      last?: TokenUsageBreakdown | null;
    };
  };
  const turnId = row.scope.kind === "turn" ? row.scope.turnId : null;
  return {
    turnId,
    seq: row.seq,
    tokenUsage: {
      total: data.tokenUsage?.total ?? null,
      last: data.tokenUsage?.last ?? null,
    },
  };
}

export async function fetchLatestAssistantRow(
  bb: Bb,
  threadId: string,
): Promise<LatestAssistantRow | null> {
  // The outline lists every conversation row thread-wide without pagination,
  // unlike `timeline` whose latest page excludes messages from older segments
  // while the current turn is still streaming. Fall back to the timeline for
  // providers/surfaces where the outline is unavailable.
  try {
    const outline = await bb.sdk.threads.conversationOutline({ threadId });
    for (let i = outline.items.length - 1; i >= 0; i--) {
      const item = outline.items[i]!;
      if (item.role === "assistant") {
        return { rowId: item.id, turnId: null };
      }
    }
    return null;
  } catch {
    const timeline = await bb.sdk.threads.timeline({ threadId });
    for (let i = timeline.rows.length - 1; i >= 0; i--) {
      const row = timeline.rows[i]!;
      if (row.kind === "conversation" && row.role === "assistant") {
        return { rowId: row.id, turnId: row.turnId };
      }
    }
    return null;
  }
}

export async function fetchLastCompletedTurn(
  bb: Bb,
  threadId: string,
): Promise<LastCompletedTurn | null> {
  const rows = await bb.sdk.threads.events.list({
    threadId,
    types: eventTypes("turnCompleted") as never,
    order: "desc",
    limit: "50",
  });
  // item/completed events carry startedAt/completedAt on the row envelope…
  // but the turn duration is only on turn/completed. Scan the mixed tail we
  // already fetched for the newest of either and derive a span from pairs.
  const completedRows = rows.filter((row) => row.type === "turn/completed");
  const row = completedRows[0];
  if (!row) return null;
  const data = row.data as { error?: unknown };
  void data;
  // turn/completed carries no duration; duration is derived from the paired
  // turn/started event below.
  const startedRows = await bb.sdk.threads.events.list({
    threadId,
    types: eventTypes("turnStarted") as never,
    order: "desc",
    limit: "5",
  });
  const started = startedRows.find(
    (candidate) =>
      candidate.scope.kind === "turn"
      && row.scope.kind === "turn"
      && candidate.scope.turnId === row.scope.turnId,
  );
  if (!started) return null;
  const durationMs = Math.max(0, row.createdAt - started.createdAt);
  return { durationMs: durationMs > 0 ? durationMs : null };
}

export async function fetchAcceptedTurnRequest(
  bb: Bb,
  threadId: string,
  turnId: string,
  beforeSeq: number,
): Promise<{ model: string | null } | null> {
  // Find the turn's accepted input event to recover its client request id.
  const acceptedRows = await bb.sdk.threads.events.list({
    threadId,
    types: eventTypes("turnInputAccepted") as never,
    order: "desc",
    limit: "20",
  });
  const accepted = acceptedRows.find(
    (row) => row.scope.kind === "turn" && row.scope.turnId === turnId,
  );
  if (accepted) {
    const clientRequestId = (accepted.data as { clientRequestId?: string })
      .clientRequestId;
    if (clientRequestId) {
      // The matching outbound request records the resolved execution options.
      const requestedRows = await bb.sdk.threads.events.list({
        threadId,
        types: eventTypes("clientTurnRequested") as never,
        order: "desc",
        limit: "20",
      });
      for (const row of requestedRows) {
        const data = row.data as {
          requestId?: string;
          execution?: { model?: string };
        };
        if (data.requestId === clientRequestId) {
          return { model: data.execution?.model ?? null };
        }
      }
    }
  }

  // Steered/plugin-initiated turns may never carry an accepted event. Fall
  // back to the newest outbound request recorded before the usage event.
  const requestedRows = await bb.sdk.threads.events.list({
    threadId,
    types: eventTypes("clientTurnRequested") as never,
    order: "desc",
    limit: "20",
  });
  for (const row of requestedRows) {
    if (row.seq >= beforeSeq) continue;
    const data = row.data as { execution?: { model?: string } };
    return { model: data.execution?.model ?? null };
  }
  return null;
}
