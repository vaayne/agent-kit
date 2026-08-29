import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { selectTaskAttention } from "./attention.js";
import type { Overview, OverviewTask, ThreadSummary } from "./server.js";

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thr_1",
    title: "result",
    parentThreadId: null,
    status: "idle",
    updatedAt: 100,
    environmentId: null,
    archived: false,
    latestAttentionAt: 100,
    lastReadAt: 90,
    unread: true,
    ...overrides,
  };
}

function task(overrides: Partial<OverviewTask> = {}): OverviewTask {
  return {
    id: "task_1",
    key: "AK-1",
    title: "Task",
    projectId: "project_1",
    status: "done",
    next: null,
    nextAt: null,
    lastMovedAt: 100,
    createdAt: 1,
    startedAt: 2,
    doneAt: 100,
    waitingOn: "nobody",
    group: "none",
    reason: "ended",
    reasonPr: null,
    threads: [thread()],
    pullRequests: [],
    ...overrides,
  };
}

function overview(tasks: readonly OverviewTask[]): Overview {
  return {
    groups: {
      you: tasks.filter((item) => item.group === "you"),
      running: tasks.filter((item) => item.group === "running"),
      stalled: tasks.filter((item) => item.group === "stalled"),
      waiting: tasks.filter((item) => item.group === "waiting"),
      backlog: tasks.filter((item) => item.group === "backlog"),
      done: tasks.filter((item) => item.group === "none"),
    },
    unfiled: [],
    filed: {},
    doneThisWeek: 0,
    pmo: null,
    language: "auto",
  };
}

function live(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "result",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "pi",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
    indicator: "none",
    indicatorLabel: null,
    isUnread: true,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: 100,
    lastReadAt: 90,
    latestAttentionAt: 100,
    ...overrides,
  };
}

describe("selectTaskAttention", () => {
  it("keeps a done task in Now and Inbox while its result is unread", () => {
    const selected = selectTaskAttention(overview([task()]), [], new Map(), null, 200);
    expect(selected.now).toHaveLength(1);
    expect(selected.inbox[0]).toMatchObject({ class: "unread", targetThreadId: "thr_1" });
  });

  it("uses live read state instead of a stale overview snapshot", () => {
    const selected = selectTaskAttention(
      overview([task()]),
      [live({ isUnread: false, lastReadAt: 100 })],
      new Map(),
      null,
      200,
    );
    expect(selected.now).toEqual([]);
  });

  it("clears a stale pending-interaction snapshot from live facts", () => {
    const asking = task({
      group: "stalled",
      waitingOn: "you",
      reason: "stalled",
      threads: [thread({ status: "pendingInteraction", unread: false, lastReadAt: 100 })],
    });
    const selected = selectTaskAttention(
      overview([asking]),
      [live({ hasPendingInteraction: false, isUnread: false, lastReadAt: 100 })],
      new Map(),
      null,
      200,
    );
    expect(selected.now).toEqual([]);
  });

  it("does not keep a read historical error from a done task forever", () => {
    const completed = task({
      threads: [thread({ status: "error", unread: false, lastReadAt: 100 })],
    });
    expect(selectTaskAttention(overview([completed]), [], new Map(), null, 200).now)
      .toEqual([]);
  });

  it("retains a newly read result for thirty minutes", () => {
    const readTask = task({ threads: [thread({ unread: false, lastReadAt: 100 })] });
    const selected = selectTaskAttention(
      overview([readTask]),
      [],
      new Map([["thr_1", { viewedAt: 150, attentionAt: 100, expiresAt: 1_950 }]]),
      null,
      200,
    );
    expect(selected.inbox[0]).toMatchObject({ class: "seen", targetThreadId: "thr_1" });
  });

  it("drops expired retention but keeps the current task visible", () => {
    const readTask = task({ threads: [thread({ unread: false, lastReadAt: 100 })] });
    const selected = selectTaskAttention(
      overview([readTask]),
      [],
      new Map([["thr_1", { viewedAt: 100, attentionAt: 100, expiresAt: 150 }]]),
      "thr_1",
      200,
    );
    expect(selected.now[0]).toMatchObject({ class: "current", inbox: false });
    expect(selected.inbox).toEqual([]);
  });

  it("moves a task with any pinned thread into the pinned shelf", () => {
    const waiting = task({
      group: "waiting",
      waitingOn: "agent",
      reason: "waitingAgent",
      threads: [thread({ unread: false, lastReadAt: 100 })],
    });
    const selected = selectTaskAttention(
      overview([waiting]),
      [live({ isPinned: true, isUnread: false, lastReadAt: 100 })],
      new Map(),
      null,
      200,
    );
    expect(selected.pinned[0]).toMatchObject({ class: "pinned", targetThreadId: "thr_1" });
    expect(selected.now).toEqual([]);
    expect(selected.inbox).toEqual([]);
  });

  it("keeps actionable pinned tasks in Inbox without duplicating them in Now", () => {
    const selected = selectTaskAttention(
      overview([task()]),
      [live({ isPinned: true })],
      new Map(),
      null,
      200,
    );
    expect(selected.pinned[0]).toMatchObject({ class: "unread" });
    expect(selected.now).toEqual([]);
    expect(selected.inbox).toHaveLength(1);
  });

  it("puts actionable and unread tasks ahead of stable running work", () => {
    const action = task({ id: "action", key: "AK-2", group: "you", waitingOn: "you", reason: "review" });
    const running = task({
      id: "running",
      key: "AK-3",
      group: "running",
      waitingOn: "agent",
      reason: "running",
      threads: [thread({ id: "thr_3", status: "running", unread: false, lastReadAt: 100 })],
    });
    const selected = selectTaskAttention(overview([running, action]), [], new Map(), null, 200);
    expect(selected.now.map((item) => item.class)).toEqual(["action", "running"]);
    expect(selected.inbox).toHaveLength(1);
  });
});
