import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { reconcileAttentionRetention, retainAttention, useAttentionRetention } from "./attention-retention.js";
import { type AttentionSelection, mergeThreadSummary, selectTaskAttention } from "./attention.js";
import type { Overview, ThreadSummary } from "./server.js";
import { useOpenThread } from "./useTaskOverview.js";

export function useTaskAttention(
  overview: Overview | null,
  activeThreadId: string | null,
): AttentionSelection {
  const { threads: liveThreads } = useSidebarThreads();
  const retention = useAttentionRetention();
  const previousAttention = useRef(new Map<string, number>());

  const observedAttention = useMemo(() => {
    if (overview === null) return new Map<string, number | null>();
    const liveById = new Map(liveThreads.map((thread) => [thread.id, thread]));
    return new Map(
      Object.values(overview.groups).flat().flatMap((task) =>
        task.threads.map((thread) => {
          const merged = mergeThreadSummary(thread, liveById.get(thread.id));
          return [merged.id, merged.latestAttentionAt] as const;
        })
      ),
    );
  }, [liveThreads, overview]);

  useEffect(() => {
    reconcileAttentionRetention(observedAttention);
  }, [observedAttention]);

  useEffect(() => {
    if (activeThreadId === null) return;
    const live = liveThreads.find((thread) => thread.id === activeThreadId);
    if (live === undefined || live.isArchived) return;
    const previous = previousAttention.current.get(live.id);
    previousAttention.current.set(live.id, live.latestAttentionAt);
    // A visible thread can be auto-read as its final answer lands, so it may never
    // pass through an observable unread state. Retain the attention transition itself.
    if (previous !== undefined && live.latestAttentionAt > previous) {
      retainAttention(live.id, live.latestAttentionAt);
    }
  }, [activeThreadId, liveThreads]);

  return useMemo(
    () =>
      overview === null
        ? { now: [], inbox: [] }
        : selectTaskAttention(overview, liveThreads, retention, activeThreadId),
    [activeThreadId, liveThreads, overview, retention],
  );
}

export function useOpenAttentionThread(): (
  thread: ThreadSummary,
  options?: { retainSeen?: boolean },
) => void {
  const { threads: liveThreads } = useSidebarThreads();
  const actions = useSidebarThreadActions();
  const openThread = useOpenThread();
  return useCallback((thread, options) => {
    const effective = mergeThreadSummary(
      thread,
      liveThreads.find((candidate) => candidate.id === thread.id),
    );
    if (
      effective.latestAttentionAt !== null
      && (effective.unread || options?.retainSeen === true)
    ) {
      // Retain before mark-read so the row cannot disappear between realtime frames.
      retainAttention(effective.id, effective.latestAttentionAt);
    }
    if (effective.unread) void actions.setRead(effective.id, true);
    openThread(effective);
  }, [actions, liveThreads, openThread]);
}
