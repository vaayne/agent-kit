import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { Overview, OverviewTask, ThreadSummary } from "./server.js";

export const ATTENTION_RETENTION_MS = 30 * 60_000;

export interface AttentionRetention {
  viewedAt: number;
  attentionAt: number;
  expiresAt: number;
}

export type AttentionRetentionMap = ReadonlyMap<string, AttentionRetention>;
export type TaskAttentionClass =
  | "asking"
  | "error"
  | "action"
  | "unread"
  | "seen"
  | "running"
  | "current"
  | "pinned";

export interface TaskAttentionItem {
  task: OverviewTask;
  class: TaskAttentionClass;
  at: number;
  targetThreadId: string | null;
  inbox: boolean;
}

export interface AttentionSelection {
  pinned: readonly TaskAttentionItem[];
  now: readonly TaskAttentionItem[];
  inbox: readonly TaskAttentionItem[];
}

function liveRunning(thread: PluginSidebarThread): boolean {
  return thread.indicator === "runtime"
    || thread.indicator === "background-agent"
    || thread.indicator === "background-command"
    || thread.indicator === "goal"
    || thread.indicator === "plan-mode"
    || thread.indicator === "workflow"
    || Object.values(thread.activity).some((count) => count > 0);
}

export function threadSummaryFromLive(thread: PluginSidebarThread): ThreadSummary {
  return {
    id: thread.id,
    title: thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread",
    parentThreadId: thread.parentThreadId,
    status: thread.hasPendingInteraction ? "pendingInteraction" : liveRunning(thread) ? "running" : "idle",
    updatedAt: thread.updatedAt,
    environmentId: thread.environment?.id ?? null,
    archived: thread.isArchived,
    latestAttentionAt: thread.isArchived ? null : thread.latestAttentionAt,
    lastReadAt: thread.lastReadAt,
    unread: !thread.isArchived && thread.isUnread,
  };
}

/** Overlay the expensive overview with BB's live read and activity facts. */
export function mergeThreadSummary(
  thread: ThreadSummary,
  live: PluginSidebarThread | undefined,
): ThreadSummary {
  if (live === undefined) return thread;
  const status = live.hasPendingInteraction
    ? "pendingInteraction"
    : liveRunning(live)
    ? "running"
    : thread.status === "running" || thread.status === "pendingInteraction"
    ? "idle"
    : thread.status;
  return {
    ...thread,
    status,
    updatedAt: live.updatedAt,
    archived: live.isArchived,
    latestAttentionAt: live.isArchived ? null : live.latestAttentionAt,
    lastReadAt: live.lastReadAt,
    unread: !live.isArchived && live.isUnread,
  };
}

function newest(
  threads: readonly ThreadSummary[],
  predicate: (thread: ThreadSummary) => boolean,
  timestamp: (thread: ThreadSummary) => number,
): ThreadSummary | undefined {
  return threads
    .filter(predicate)
    .sort((left, right) => timestamp(right) - timestamp(left) || right.updatedAt - left.updatedAt)[0];
}

function retainedThread(
  threads: readonly ThreadSummary[],
  retention: AttentionRetentionMap,
  now: number,
): { thread: ThreadSummary; retained: AttentionRetention } | undefined {
  return threads.flatMap((thread) => {
    const retained = retention.get(thread.id);
    if (
      retained === undefined
      || retained.expiresAt <= now
      || thread.archived
      || thread.latestAttentionAt === null
      || retained.attentionAt < thread.latestAttentionAt
    ) {
      return [];
    }
    return [{ thread, retained }];
  }).sort((left, right) => right.retained.viewedAt - left.retained.viewedAt)[0];
}

function targetForAction(task: OverviewTask): ThreadSummary | undefined {
  return newest(task.threads, (thread) => !thread.archived, (thread) => thread.updatedAt);
}

function attentionForTask(
  task: OverviewTask,
  retention: AttentionRetentionMap,
  activeThreadId: string | null,
  now: number,
): TaskAttentionItem | null {
  const asking = newest(
    task.threads,
    (thread) => !thread.archived && thread.status === "pendingInteraction",
    (thread) => thread.updatedAt,
  );
  if (asking !== undefined) {
    return { task, class: "asking", at: asking.updatedAt, targetThreadId: asking.id, inbox: true };
  }

  const errored = newest(
    task.threads,
    (thread) => !thread.archived && thread.status === "error",
    (thread) => thread.latestAttentionAt ?? thread.updatedAt,
  );
  // Terminal tasks may retain failed historical attempts; only a derived live
  // error is actionable enough to stay in the inbox indefinitely.
  if (errored !== undefined && task.reason === "error") {
    return {
      task,
      class: "error",
      at: errored.latestAttentionAt ?? errored.updatedAt,
      targetThreadId: errored.id,
      inbox: true,
    };
  }

  if (task.group === "you") {
    const target = targetForAction(task);
    return {
      task,
      class: "action",
      at: task.lastMovedAt ?? target?.updatedAt ?? 0,
      targetThreadId: target?.id ?? null,
      inbox: true,
    };
  }

  const unread = newest(
    task.threads,
    (thread) => !thread.archived && thread.unread && thread.latestAttentionAt !== null,
    (thread) => thread.latestAttentionAt ?? 0,
  );
  if (unread !== undefined) {
    return {
      task,
      class: "unread",
      at: unread.latestAttentionAt ?? unread.updatedAt,
      targetThreadId: unread.id,
      inbox: true,
    };
  }

  const seen = retainedThread(task.threads, retention, now);
  if (seen !== undefined) {
    return {
      task,
      class: "seen",
      at: seen.retained.viewedAt,
      targetThreadId: seen.thread.id,
      inbox: true,
    };
  }

  const running = newest(
    task.threads,
    (thread) => !thread.archived && thread.status === "running",
    (thread) => thread.updatedAt,
  );
  if (running !== undefined || task.group === "running") {
    const target = running ?? targetForAction(task);
    return {
      task,
      class: "running",
      at: target?.updatedAt ?? task.lastMovedAt ?? 0,
      targetThreadId: target?.id ?? null,
      inbox: false,
    };
  }

  if (activeThreadId !== null && task.threads.some((thread) => thread.id === activeThreadId)) {
    return { task, class: "current", at: 0, targetThreadId: activeThreadId, inbox: false };
  }
  return null;
}

const CLASS_ORDER: Record<TaskAttentionClass, number> = {
  asking: 0,
  error: 1,
  action: 2,
  unread: 3,
  seen: 4,
  running: 5,
  current: 6,
  pinned: 7,
};

function compareAttention(left: TaskAttentionItem, right: TaskAttentionItem): number {
  const classOrder = CLASS_ORDER[left.class] - CLASS_ORDER[right.class];
  if (classOrder !== 0) return classOrder;
  if (left.class === "running" && right.class === "running") {
    return left.task.key.localeCompare(right.task.key);
  }
  return right.at - left.at || left.task.key.localeCompare(right.task.key);
}

export function selectTaskAttention(
  overview: Overview,
  liveThreads: readonly PluginSidebarThread[],
  retention: AttentionRetentionMap,
  activeThreadId: string | null,
  now = Date.now(),
): AttentionSelection {
  const liveById = new Map(liveThreads.map((thread) => [thread.id, thread]));
  const tasks = Object.values(overview.groups).flat().map((task) => ({
    ...task,
    threads: task.threads.map((thread) => mergeThreadSummary(thread, liveById.get(thread.id))),
  }));
  const pinnedThreadIds = new Set(
    liveThreads.filter((thread) => thread.isPinned && !thread.isArchived).map((thread) => thread.id),
  );
  const pinned = tasks.flatMap((task) => {
    const pinnedThreads = task.threads.filter((thread) => pinnedThreadIds.has(thread.id));
    if (pinnedThreads.length === 0) return [];
    const attention = attentionForTask(task, retention, activeThreadId, now);
    const target = attention?.targetThreadId !== null && attention?.targetThreadId !== undefined
      ? attention.targetThreadId
      : newest(pinnedThreads, () => true, (thread) => thread.updatedAt)?.id ?? null;
    return [
      {
        task,
        class: attention?.class ?? "pinned",
        at: attention?.at ?? Math.max(...pinnedThreads.map((thread) => thread.updatedAt)),
        targetThreadId: target,
        inbox: attention?.inbox ?? false,
      } satisfies TaskAttentionItem,
    ];
  }).sort(compareAttention);
  const pinnedTaskIds = new Set(pinned.map((item) => item.task.id));
  const selected = tasks
    .filter((task) => !pinnedTaskIds.has(task.id))
    .flatMap((task) => {
      const attention = attentionForTask(task, retention, activeThreadId, now);
      return attention === null ? [] : [attention];
    })
    .sort(compareAttention);
  return {
    pinned,
    now: selected,
    inbox: [...pinned.filter((item) => item.inbox), ...selected.filter((item) => item.inbox)].sort(compareAttention),
  };
}
