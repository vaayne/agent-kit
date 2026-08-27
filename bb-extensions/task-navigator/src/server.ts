import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { deriveTaskState, REASON_CODES, type DerivedPullRequest, type DerivedThread } from "./derive.js";
import { parseNext } from "./next.js";
import { TaskBindings, taskInstructions } from "./task-bindings.js";
import {
  createComment,
  createTask,
  delegate,
  getTaskByKey,
  listAllTasks,
  listComments,
  listPresets,
  listProjects,
  listTaskThreads,
  taskThreadsAttach,
  updateTask,
  type Task,
  type TaskComment,
  type TaskThread,
} from "./tasks-client.js";
import type { UsageLimitsResult, UsageProvider, UsageResponse, UsageWindow } from "./usage.js";

const prSchema = z
  .object({
    number: z.number().int(),
    title: z.string(),
    url: z.string().url(),
    state: z.enum(["draft", "open", "merged", "closed"]),
    attention: z.enum([
      "blocked",
      "changes_requested",
      "checks_failed",
      "checks_pending",
      "closed",
      "conflicts",
      "draft",
      "merged",
      "none",
      "ready_to_merge",
      "review_requested",
    ]),
    checksState: z.enum(["pending", "passing", "failing", "no_checks", "unknown"]),
    updatedAt: z.number(),
  })
  .strict();
const cachedPrSchema = z
  .object({ pullRequest: prSchema.nullable(), fetchedAt: z.number() })
  .strict();
type CachedPr = z.infer<typeof cachedPrSchema>;

const threadSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    parentThreadId: z.string().nullable(),
    status: z.enum(["running", "pendingInteraction", "error", "idle"]),
    updatedAt: z.number(),
    environmentId: z.string().nullable(),
    /** The host's open() ignores archived threads; the UI must route to them explicitly. */
    archived: z.boolean(),
  })
  .strict();
const pullRequestSummarySchema = prSchema;
const taskOverviewSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    projectId: z.string(),
    status: z.string(),
    next: z.string().nullable(),
    /** When the current Next was written; the PMO ages it. */
    nextAt: z.number().nullable(),
    lastMovedAt: z.number().nullable(),
    createdAt: z.number().nullable(),
    /** First thread attached; the moment work actually began. */
    startedAt: z.number().nullable(),
    /** Recorded by this plugin when it first observes status = done; older tasks fall back to updatedAt. */
    doneAt: z.number().nullable(),
    waitingOn: z.enum(["you", "agent", "ci", "nobody"]),
    group: z.enum(["you", "running", "stalled", "waiting", "backlog", "none"]),
    reason: z.enum(REASON_CODES),
    reasonPr: z.number().int().nullable(),
    threads: z.array(threadSummarySchema),
    pullRequests: z.array(pullRequestSummarySchema),
  })
  .strict();
const overviewSchema = z
  .object({
    groups: z
      .object({
        you: z.array(taskOverviewSchema),
        running: z.array(taskOverviewSchema),
        stalled: z.array(taskOverviewSchema),
        waiting: z.array(taskOverviewSchema),
        backlog: z.array(taskOverviewSchema),
        /** Finished within the recent window; their threads stay reachable from the sidebar. */
        done: z.array(taskOverviewSchema),
      })
      .strict(),
    unfiled: z.array(threadSummarySchema),
    filed: z.record(z.string(), z.string()),
    doneThisWeek: z.number().int().nonnegative(),
    /** The standing PMO thread, when the pmoThreadId setting names one that exists. */
    pmo: threadSummarySchema.nullable(),
    /** UI language from the plugin setting; "auto" follows the browser. */
    language: z.enum(["auto", "zh", "en"]),
  })
  .strict();

const usageWindowSchema = z
  .object({
    label: z.string().min(1),
    usedPercent: z.number().min(0).max(100),
    resetsAt: z.string().min(1).nullable(),
    cost: z
      .object({
        usedUsdCents: z.number().int().nonnegative(),
        limitUsdCents: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
const usageProviderSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ok"),
      planLabel: z.string().min(1).nullable(),
      windows: z.array(usageWindowSchema),
    })
    .strict(),
  z.object({ status: z.literal("not_installed") }).strict(),
  z.object({ status: z.literal("unauthenticated") }).strict(),
  z.object({ status: z.literal("expired") }).strict(),
  z
    .object({
      status: z.literal("error"),
      message: z.string().min(1),
      planLabel: z.string().min(1).nullable(),
    })
    .strict(),
]);
const usageLimitsResultSchema = z
  .object({
    usage: z.record(z.string().min(1), usageProviderSchema).nullable(),
    fetchedAt: z.number().nullable(),
    isStale: z.boolean(),
    error: z.string().nullable(),
  })
  .strict();

export type Overview = z.infer<typeof overviewSchema>;
export type OverviewTask = z.infer<typeof taskOverviewSchema>;
export type ThreadSummary = z.infer<typeof threadSummarySchema>;

export const taskNavigatorRpc = defineRpcContract({
  ping: {
    input: z.object({}).strict(),
    output: z.object({ count: z.number().int().nonnegative() }).strict(),
  },
  overview: {
    input: z.object({}).strict(),
    output: overviewSchema,
  },
  promoteThread: {
    input: z.object({ threadId: z.string().startsWith("thr_") }).strict(),
    output: z.object({
      taskKey: z.string(),
      attachedThreadIds: z.array(z.string().startsWith("thr_")),
    }).strict(),
  },
  archiveStale: {
    input: z.object({ taskIds: z.array(z.string()).min(1) }).strict(),
    output: z.object({ archivedTaskIds: z.array(z.string()) }).strict(),
  },
  writeNext: {
    input: z.object({ taskId: z.string(), next: z.string().trim().min(1) }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  attachThread: {
    input: z.object({ taskKey: z.string().trim().min(1), threadId: z.string().startsWith("thr_") }).strict(),
    output: z.object({ taskKey: z.string() }).strict(),
  },
  lastAgentMessage: {
    input: z.object({ threadId: z.string().startsWith("thr_") }).strict(),
    output: z.object({ text: z.string().nullable() }).strict(),
  },
  createTaskAndSpawn: {
    input: z.object({ bbProjectId: z.string().nullable(), title: z.string().trim().min(1) }).strict(),
    output: z.object({ taskKey: z.string(), threadId: z.string().startsWith("thr_") }).strict(),
  },
  usageLimits: {
    input: z.object({ force: z.boolean() }).strict(),
    output: usageLimitsResultSchema,
  },
});

type BbThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number];
type ThreadFacts = DerivedThread & {
  id: string;
  title: string;
  parentThreadId: string | null;
  updatedAt: number;
  environmentId: string | null;
  archived: boolean;
};

const PR_CACHE_PREFIX = "pull-request:";
const MAX_THREAD_LIST_LIMIT = 5_000;
const USAGE_CACHE_MS = 30_000;
// Thread events arrive in bursts (active/idle flaps); one overview per burst is enough for every subscriber.
const PUBLISH_DEBOUNCE_MS = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function parseTime(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const LAST_MESSAGE_MAX_CHARS = 160;

/** Agent replies are markdown; the re-entry line wants one plain sentence. */
function firstSentence(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/[→➜]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = plain.split(/(?<=[.!?。！？])\s+/u, 1)[0] ?? plain;
  return sentence.length > LAST_MESSAGE_MAX_CHARS
    ? `${sentence.slice(0, LAST_MESSAGE_MAX_CHARS - 1)}…`
    : sentence;
}

function taskKey(task: Task): string {
  return task.key ?? task.id;
}

function threadStatus(thread: BbThread): ThreadFacts["status"] {
  if (thread.hasPendingInteraction) return "pendingInteraction";
  const status = String(thread.status);
  if (status === "error" || status === "failed") return "error";
  const activity = thread.activity;
  if (
    status === "active"
    || activity.activeBackgroundAgentCount > 0
    || activity.activeBackgroundCommandCount > 0
    || activity.activeGoalCount > 0
    || activity.activePlanModeCount > 0
    || activity.activeWorkflowCount > 0
  ) {
    return "running";
  }
  return "idle";
}

function threadFacts(thread: BbThread): ThreadFacts {
  return {
    id: thread.id,
    title: thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread",
    parentThreadId: thread.parentThreadId,
    status: threadStatus(thread),
    updatedAt: thread.updatedAt,
    environmentId: thread.environmentId,
    archived: thread.archivedAt !== null,
  };
}

type BbThreadDetail = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["get"]>>;

/** The detail endpoint omits activity counters and pending interactions; archived threads are idle anyway. */
function threadFactsFromDetail(thread: BbThreadDetail): ThreadFacts {
  const status = String(thread.status);
  return {
    id: thread.id,
    title: thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread",
    parentThreadId: thread.parentThreadId,
    status: status === "error" || status === "failed"
      ? "error"
      : status === "active" || thread.activeBackgroundAgentCount > 0
      ? "running"
      : "idle",
    updatedAt: thread.updatedAt,
    environmentId: thread.environmentId,
    archived: thread.archivedAt !== null,
  };
}

function toThreadSummary(thread: ThreadFacts) {
  return {
    id: thread.id,
    title: thread.title,
    parentThreadId: thread.parentThreadId,
    status: thread.status,
    updatedAt: thread.updatedAt,
    environmentId: thread.environmentId,
    archived: thread.archived,
  };
}

function refreshAfterMs(cached: CachedPr): number {
  if (cached.pullRequest?.checksState === "pending") return 2 * 60_000;
  if (
    cached.pullRequest?.state === "merged"
    || cached.pullRequest?.state === "closed"
  ) {
    return 60 * 60_000;
  }
  return 10 * 60_000;
}

type AvailablePullRequest = Extract<
  Awaited<ReturnType<BbPluginApi["sdk"]["environments"]["pullRequest"]>>,
  { outcome: "available" }
>["pullRequest"];

function projectPullRequest(
  pullRequest: AvailablePullRequest,
): z.infer<typeof prSchema> {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    state: pullRequest.state,
    attention: pullRequest.attention,
    checksState: pullRequest.checks.state,
    updatedAt: parseTime(pullRequest.updatedAt) ?? Date.now(),
  };
}

async function readPullRequest(
  bb: BbPluginApi,
  environmentId: string,
): Promise<CachedPr | null> {
  const key = `${PR_CACHE_PREFIX}${environmentId}`;
  const cachedValue = await bb.storage.kv.get<unknown>(key);
  const cached = cachedPrSchema.safeParse(cachedValue);
  if (cached.success && Date.now() - cached.data.fetchedAt < refreshAfterMs(cached.data)) {
    return cached.data;
  }
  try {
    const result = await bb.sdk.environments.pullRequest({ environmentId });
    if (result.outcome === "unavailable") throw new Error(result.message);
    const next: CachedPr = {
      pullRequest: result.outcome === "available"
        ? projectPullRequest(result.pullRequest)
        : null,
      fetchedAt: Date.now(),
    };
    await bb.storage.kv.set(key, next);
    return next;
  } catch (error) {
    bb.log.warn(`PR refresh for ${environmentId} failed: ${errorMessage(error)}`);
    if (cached.success) return cached.data;
    // Unavailable environments (archived worktrees, 409) stay unavailable; back off instead of retrying every overview.
    const empty: CachedPr = { pullRequest: null, fetchedAt: Date.now() };
    await bb.storage.kv.set(key, empty);
    return empty;
  }
}

function nextAndLastMoved(task: Task, comments: readonly TaskComment[], threads: readonly ThreadFacts[], prs: readonly CachedPr[]): {
  next: string | null;
  nextAt: number | null;
  lastMovedAt: number | null;
} {
  const parsedNext = parseNext(comments);
  const candidates = [
    parseTime(task.updatedAt),
    ...comments.map((comment) => parseTime(comment.createdAt)),
    ...threads.map((thread) => thread.updatedAt),
    ...prs.map((pr) => pr.pullRequest?.updatedAt ?? null),
  ].filter((value): value is number => value !== null);
  return {
    next: parsedNext.next,
    nextAt: parsedNext.lastNextAt,
    lastMovedAt: candidates.length > 0 ? Math.max(...candidates) : null,
  };
}

function withinCurrentWeek(timestamp: number, now: number): boolean {
  return timestamp >= now - 7 * 24 * 60 * 60_000;
}

/** Every thread below the root, however deep; parent links are followed via a child index, not a depth cap. */
function subtreeThreadIds(rootThreadId: string, threads: readonly BbThread[]): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const thread of threads) {
    if (thread.parentThreadId === null) continue;
    const siblings = childrenByParent.get(thread.parentThreadId) ?? [];
    siblings.push(thread.id);
    childrenByParent.set(thread.parentThreadId, siblings);
  }
  const ordered = [rootThreadId];
  for (let index = 0; index < ordered.length; index++) {
    for (const childId of childrenByParent.get(ordered[index]!) ?? []) {
      if (!ordered.includes(childId)) ordered.push(childId);
    }
  }
  return ordered;
}

function projectUsageWindow(window: {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  cost?: { usedUsdCents: number; limitUsdCents: number };
}): UsageWindow {
  return {
    label: window.label,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
    ...(window.cost === undefined
      ? {}
      : { cost: { usedUsdCents: window.cost.usedUsdCents, limitUsdCents: window.cost.limitUsdCents } }),
  };
}

type RawUsageResponse = Awaited<ReturnType<BbPluginApi["sdk"]["system"]["usageLimits"]>>;

function projectUsageProvider(provider: RawUsageResponse[keyof RawUsageResponse]): UsageProvider {
  switch (provider.status) {
    case "ok":
      return { status: "ok", planLabel: provider.planLabel, windows: provider.windows.map(projectUsageWindow) };
    case "error":
      return { status: "error", message: provider.message, planLabel: provider.planLabel };
    case "not_installed":
    case "unauthenticated":
    case "expired":
      return { status: provider.status };
  }
}

/** Project the daemon response before it crosses into the browser, stripping email. */
function projectUsage(response: RawUsageResponse): UsageResponse {
  return Object.fromEntries(
    Object.entries(response).map(([id, provider]) => [id, projectUsageProvider(provider)]),
  );
}

const STALE_AFTER_MS = 30 * 24 * 60 * 60_000;
// Tasks carries no status history, so the plugin remembers the last status it saw per task and
// timestamps the change. Only transitions observed while the plugin runs are exact.
const STATUS_LOG_KEY = "status-log";
type StatusLog = Record<string, { status: string; at: number }>;
// 7 days keeps Unfiled a nudge (~70 rows here), not a full history; widen if scratch work is filed later than that.
const UNFILED_WINDOW_MS = 7 * 24 * 60 * 60_000;
// Finished tasks stay in the sidebar this long so their threads remain reachable; older history lives in Tasks.
const DONE_WINDOW_MS = 30 * 24 * 60 * 60_000;

export default function plugin(bb: BbPluginApi) {
  const bindings = new TaskBindings(bb);
  const settings = bb.settings.define({
    delegationPreset: {
      type: "string",
      label: "Delegation preset",
      description: "Tasks preset used when 先建 task starts the first thread.",
      default: "Luna",
    },
    pmoThreadId: {
      type: "string",
      label: "PMO thread",
      description: "Thread id of the standing PMO thread shown at the top of the sidebar (thr_…). Empty hides the row.",
      default: "",
    },
    language: {
      type: "string",
      label: "Language",
      description: "UI language: auto (follow the browser), zh, or en.",
      default: "auto",
    },
  });
  let statusLog: StatusLog | null = null;
  const loadStatusLog = async (): Promise<StatusLog> => {
    if (statusLog === null) statusLog = (await bb.storage.kv.get<StatusLog>(STATUS_LOG_KEY)) ?? {};
    return statusLog;
  };
  void bindings.rebuild().catch((error: unknown) => {
    bb.log.warn(`Could not initialize task bindings: ${errorMessage(error)}`);
  });

  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  const publishOverviewChanged = () => {
    if (publishTimer !== null) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      bb.realtime.publish("overview-changed", null);
    }, PUBLISH_DEBOUNCE_MS);
  };
  bb.events.on("thread.created", async ({ thread }) => {
    try {
      const binding = await bindings.inherit(thread);
      if (binding !== undefined) {
        bb.log.info(`Inherited task ${binding.key} for thread ${thread.id}`);
      }
    } catch (error) {
      bb.log.warn(
        `Could not inherit a task for thread ${thread.id}: ${errorMessage(error)}`,
      );
    }
    publishOverviewChanged();
  });
  bb.events.on("thread.active", publishOverviewChanged);
  bb.events.on("thread.idle", publishOverviewChanged);
  bb.events.on("thread.failed", publishOverviewChanged);
  bb.events.on("thread.archived", publishOverviewChanged);
  bb.events.on("thread.deleted", async ({ thread }) => {
    try {
      await bindings.detach(thread.id);
    } catch (error) {
      bb.log.warn(`Could not detach deleted thread ${thread.id}: ${errorMessage(error)}`);
    }
    publishOverviewChanged();
  });
  bb.agents.configure((context) => {
    const binding = bindings.getForAgentContext(context);
    return {
      tools: [],
      skills: [],
      ...(binding === undefined
        ? {}
        : { instructions: taskInstructions(binding) }),
    };
  });

  const computeOverview = async (): Promise<Overview> => {
    const [tasks, allThreads, log, { pmoThreadId }] = await Promise.all([
      listAllTasks(bb),
      bb.sdk.threads.list({ includeHidden: true, limit: MAX_THREAD_LIST_LIMIT }),
      loadStatusLog(),
      settings.get(),
    ]);
    let logDirty = false;
    const transitions: { task: Task; from: string }[] = [];
    // Synchronous check-and-set, so two concurrent overviews cannot both announce one transition.
    const observeStatus = (task: Task): number | null => {
      const seen = log[task.id];
      if (seen === undefined) {
        log[task.id] = { status: task.status, at: parseTime(task.updatedAt) ?? Date.now() };
        logDirty = true;
      } else if (seen.status !== task.status) {
        log[task.id] = { status: task.status, at: Date.now() };
        logDirty = true;
        transitions.push({ task, from: seen.status });
      }
      const current = log[task.id]!;
      return current.status === "done" ? current.at : null;
    };
    const threadById = new Map(
      allThreads.map((thread) => [thread.id, threadFacts(thread)]),
    );
    // A task thread missing from the list is either archived (still real) or deleted (a ghost to detach).
    const missingThreadLookups = new Map<string, Promise<ThreadFacts | null>>();
    const resolveMissingThread = (taskId: string, taskThread: TaskThread) => {
      const existing = missingThreadLookups.get(taskThread.threadId);
      if (existing !== undefined) return existing;
      const lookup = bb.sdk.threads.get({ threadId: taskThread.threadId })
        .then((thread) => {
          if (thread.deletedAt !== null) throw new Error("deleted");
          return threadFactsFromDetail(thread);
        })
        .catch(async () => {
          bb.log.info(`Detaching missing thread ${taskThread.threadId} from task ${taskId}`);
          await bindings.detach(taskThread.threadId).catch((error: unknown) => {
            bb.log.warn(`Could not detach ${taskThread.threadId}: ${errorMessage(error)}`);
          });
          return null;
        });
      missingThreadLookups.set(taskThread.threadId, lookup);
      return lookup;
    };
    const pullRequestPromises = new Map<string, Promise<CachedPr | null>>();
    const getPullRequest = (environmentId: string) => {
      const existing = pullRequestPromises.get(environmentId);
      if (existing !== undefined) return existing;
      const promise = readPullRequest(bb, environmentId);
      pullRequestPromises.set(environmentId, promise);
      return promise;
    };
    const records = await Promise.all(tasks.map(async (task) => {
      const [{ taskThreads }, { comments }] = await Promise.all([
        listTaskThreads(bb, task.id),
        listComments(bb, task.id),
      ]);
      const threads = (await Promise.all(taskThreads.map((taskThread) => {
        const listed = threadById.get(taskThread.threadId);
        return listed === undefined ? resolveMissingThread(task.id, taskThread) : Promise.resolve(listed);
      }))).filter((thread): thread is ThreadFacts => thread !== null);
      bindings.remember(task, threads.map((thread) => ({ threadId: thread.id })));
      const environments = [...new Set(
        threads.flatMap((thread) => thread.environmentId === null ? [] : [thread.environmentId]),
      )];
      const prs = (await Promise.all(environments.map(getPullRequest)))
        .filter((value): value is CachedPr => value !== null);
      const { next, nextAt, lastMovedAt } = nextAndLastMoved(task, comments, threads, prs);
      const doneAt = observeStatus(task);
      const attachedTimes = taskThreads
        .map((taskThread) => parseTime(taskThread.attachedAt))
        .filter((value): value is number => value !== null);
      const derivedPrs: DerivedPullRequest[] = prs.flatMap((pr) =>
        pr.pullRequest === null
          ? []
          : [{
            number: pr.pullRequest.number,
            state: pr.pullRequest.state,
            checks: pr.pullRequest.checksState,
          }]
      );
      const derived = deriveTaskState({
        status: task.status,
        threads,
        pullRequests: derivedPrs,
        next,
      });
      return {
        id: task.id,
        key: taskKey(task),
        title: task.title,
        projectId: task.projectId,
        status: task.status,
        next,
        nextAt,
        lastMovedAt,
        createdAt: parseTime(task.createdAt),
        startedAt: attachedTimes.length > 0 ? Math.min(...attachedTimes) : null,
        doneAt,
        waitingOn: derived.waitingOn,
        group: derived.group,
        reason: derived.reason,
        reasonPr: derived.reasonPr,
        threads: threads.map(toThreadSummary),
        pullRequests: prs.flatMap((pr) => pr.pullRequest === null ? [] : [pr.pullRequest]),
      };
    }));
    if (logDirty) {
      await bb.storage.kv.set(STATUS_LOG_KEY, log).catch((error: unknown) => {
        bb.log.warn(`Could not persist status log: ${errorMessage(error)}`);
      });
    }
    for (const { task, from } of transitions) {
      // A comment is the durable, human-readable trail; the kv entry is only the fast index.
      void createComment(bb, { taskId: task.id, body: `Status: ${from} → ${task.status}` }).catch((error: unknown) => {
        bb.log.warn(`Could not record status change for ${taskKey(task)}: ${errorMessage(error)}`);
      });
    }
    const pmoFacts = pmoThreadId.trim() === "" ? undefined : threadById.get(pmoThreadId.trim());
    const pmo = pmoFacts === undefined ? null : toThreadSummary(pmoFacts);
    const now = Date.now();
    const groups = {
      you: records.filter((record) => record.group === "you"),
      running: records.filter((record) => record.group === "running"),
      stalled: records.filter((record) => record.group === "stalled"),
      waiting: records.filter((record) => record.group === "waiting"),
      backlog: records.filter((record) => record.group === "backlog"),
      done: records
        .filter((record) =>
          record.group === "none"
          && record.threads.length > 0
          && record.lastMovedAt !== null
          && now - record.lastMovedAt <= DONE_WINDOW_MS
        )
        .sort((left, right) => (right.lastMovedAt ?? 0) - (left.lastMovedAt ?? 0)),
    };
    const filed: Record<string, string> = {};
    for (const record of records) {
      for (const thread of record.threads) filed[thread.id] = record.key;
    }
    // Unfiled is a nudge to file recent scratch work, not an archive of every root thread.
    const unfiled = allThreads
      .filter((thread) =>
        thread.parentThreadId === null
        && thread.visibility === "visible"
        && thread.archivedAt === null
        && now - thread.updatedAt <= UNFILED_WINDOW_MS
        && filed[thread.id] === undefined
        && thread.id !== pmo?.id
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(threadFacts)
      .map(toThreadSummary);
    const doneThisWeek = tasks.filter((task) =>
      task.status === "done"
      && withinCurrentWeek(parseTime(task.updatedAt) ?? 0, now)
    ).length;
    const { language: rawLanguage } = await settings.get();
    const language = rawLanguage === "zh" || rawLanguage === "en" ? rawLanguage : "auto";
    return overviewSchema.parse({ groups, unfiled, filed, doneThisWeek, pmo, language });
  };

  let cachedUsage: { usage: UsageResponse; fetchedAt: number } | null = null;

  bb.rpc.register(taskNavigatorRpc, {
    async ping() {
      const tasks = await listAllTasks(bb);
      const count = tasks.length;
      bb.log.info(`Tasks RPC ping: ${count} tasks`);
      await bindings.rebuild();
      return { count };
    },
    async overview() {
      return computeOverview();
    },
    async promoteThread({ threadId }) {
      const existing = bindings.get(threadId);
      if (existing !== undefined) {
        throw new Error(`Thread already belongs to ${existing.key}; use 改绑 to move it`);
      }
      const [thread, { projects }, allThreads] = await Promise.all([
        bb.sdk.threads.get({ threadId }),
        listProjects(bb),
        bb.sdk.threads.list({ includeHidden: true, limit: MAX_THREAD_LIST_LIMIT }),
      ]);
      const project = projects.find((candidate) =>
        candidate.linkedBbProjectId === thread.projectId
      );
      if (project === undefined) {
        throw new Error(`No task project is linked to BB project ${thread.projectId}; link one with bb tasks project`);
      }
      const result = await createTask(bb, {
        projectId: project.id,
        title: thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread",
      });
      if (!result.ok) throw new Error(result.error.message);
      // Descendants already filed elsewhere keep their task; only free threads follow the root.
      const attachedThreadIds = subtreeThreadIds(threadId, allThreads)
        .filter((candidate) => candidate === threadId || bindings.get(candidate) === undefined);
      await Promise.all(attachedThreadIds.map((candidate) =>
        taskThreadsAttach(bb, result.task.id, candidate)
      ));
      bindings.remember(result.task, attachedThreadIds.map((candidate) => ({ threadId: candidate })));
      publishOverviewChanged();
      return { taskKey: taskKey(result.task), attachedThreadIds };
    },
    async archiveStale({ taskIds }) {
      // The browser proposes; the server re-derives so a stale page cannot cancel live work.
      const overview = await computeOverview();
      const now = Date.now();
      const eligible = new Set(
        overview.groups.stalled
          .filter((task) => task.lastMovedAt !== null && now - task.lastMovedAt > STALE_AFTER_MS)
          .map((task) => task.id),
      );
      const results = await Promise.allSettled(
        taskIds.filter((taskId) => eligible.has(taskId)).map(async (taskId) => {
          const result = await updateTask(bb, { taskId, status: "canceled" });
          if (!result.ok) throw new Error(result.error.message);
          return taskId;
        }),
      );
      const archivedTaskIds: string[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") archivedTaskIds.push(result.value);
        else bb.log.warn(`archiveStale skipped one task: ${errorMessage(result.reason)}`);
      }
      publishOverviewChanged();
      return { archivedTaskIds };
    },
    async writeNext({ taskId, next }) {
      await createComment(bb, { taskId, body: `Next: ${next}` });
      publishOverviewChanged();
      return { ok: true as const };
    },
    async attachThread({ taskKey: key, threadId }) {
      const result = await getTaskByKey(bb, key);
      if (result.task === null) throw new Error(`Task not found: ${key}`);
      await bindings.rebind(threadId, result.task);
      publishOverviewChanged();
      return { taskKey: taskKey(result.task) };
    },
    async lastAgentMessage({ threadId }) {
      const output = await bb.sdk.threads.output({ threadId });
      const text = output.output?.trim() || null;
      return { text: text === null ? null : firstSentence(text) };
    },
    async createTaskAndSpawn({ bbProjectId, title }) {
      const [bbProjects, taskProjects, presets] = await Promise.all([
        bb.sdk.projects.list({ includePersonal: true }),
        listProjects(bb),
        listPresets(bb),
      ]);
      const selectedBbProjectId = bbProjectId
        ?? bbProjects.find((project) => project.kind === "personal")?.id;
      if (selectedBbProjectId === undefined) {
        throw new Error("Select a project first; no personal BB project is available as a fallback");
      }
      const project = taskProjects.projects.find((candidate) =>
        candidate.linkedBbProjectId === selectedBbProjectId
      );
      if (project === undefined) {
        throw new Error(`No task project is linked to BB project ${selectedBbProjectId}; link one with bb tasks project`);
      }
      const { delegationPreset } = await settings.get();
      const preset = presets.presets.find((candidate) => candidate.name === delegationPreset);
      if (preset === undefined) {
        const names = presets.presets.map((candidate) => candidate.name).join(", ") || "none";
        throw new Error(`Tasks preset "${delegationPreset}" not found (available: ${names}); change it in the plugin settings`);
      }
      const created = await createTask(bb, { projectId: project.id, title });
      if (!created.ok) throw new Error(created.error.message);
      const delegated = await delegate(bb, {
        taskId: created.task.id,
        presetId: preset.id,
        extraInstructions: `Start working on task ${taskKey(created.task)}.`,
      });
      publishOverviewChanged();
      return { taskKey: taskKey(created.task), threadId: delegated.threadId };
    },
    async usageLimits({ force }): Promise<UsageLimitsResult> {
      if (!force && cachedUsage !== null && Date.now() - cachedUsage.fetchedAt < USAGE_CACHE_MS) {
        return { ...cachedUsage, isStale: false, error: null };
      }
      try {
        // No host ID selects BB's primary machine; the daemon owns credentials.
        const usage = projectUsage(await bb.sdk.system.usageLimits());
        cachedUsage = { usage, fetchedAt: Date.now() };
        return { ...cachedUsage, isStale: false, error: null };
      } catch (error) {
        const message = errorMessage(error) || "Could not load usage from the BB primary machine.";
        bb.log.warn(`Usage refresh failed: ${message}`);
        return cachedUsage
          ? { ...cachedUsage, isStale: true, error: message }
          : { usage: null, fetchedAt: null, isStale: false, error: message };
      }
    },
  });
}
