import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { deriveTaskState, type DerivedPullRequest, type DerivedThread } from "./derive.js";
import { parseNext } from "./next.js";
import { TaskBindings, taskInstructions } from "./task-bindings.js";
import {
  createTask,
  listComments,
  listProjects,
  listTaskThreads,
  listTasks,
  taskThreadsAttach,
  type Task,
  type TaskComment,
  type TaskThread,
} from "./tasks-client.js";

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
    checksState: z.enum(["pending", "complete"]),
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
    lastMovedAt: z.number().nullable(),
    waitingOn: z.enum(["you", "agent", "ci", "nobody"]),
    group: z.enum(["you", "running", "stalled", "waiting", "none"]),
    reason: z.string(),
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
      })
      .strict(),
    unfiled: z.array(threadSummarySchema),
    doneThisWeek: z.number().int().nonnegative(),
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
});

type BbThread = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["list"]>>[number];
type ThreadFacts = DerivedThread & {
  id: string;
  title: string;
  parentThreadId: string | null;
  updatedAt: number;
  environmentId: string | null;
};

const PR_CACHE_PREFIX = "pull-request:";
const MAX_THREAD_LIST_LIMIT = 5_000;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function parseTime(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  };
}

function fallbackThreadFacts(taskThread: TaskThread): ThreadFacts {
  const liveStatus = taskThread.liveStatus.toLowerCase();
  return {
    id: taskThread.threadId,
    title: taskThread.title || "Untitled thread",
    parentThreadId: null,
    status: liveStatus === "running" || liveStatus === "active"
      ? "running"
      : liveStatus === "failed" || liveStatus === "error"
      ? "error"
      : "idle",
    updatedAt: parseTime(taskThread.updatedAt) ?? parseTime(taskThread.attachedAt) ?? 0,
    environmentId: null,
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
    checksState: pullRequest.checks.state === "pending" ? "pending" : "complete",
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
    return cached.success ? cached.data : null;
  }
}

function nextAndLastMoved(task: Task, comments: readonly TaskComment[], threads: readonly ThreadFacts[], prs: readonly CachedPr[]): {
  next: string | null;
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
    lastMovedAt: candidates.length > 0 ? Math.max(...candidates) : null,
  };
}

function withinCurrentWeek(timestamp: number, now: number): boolean {
  return timestamp >= now - 7 * 24 * 60 * 60_000;
}

function isDescendant(
  candidate: BbThread,
  rootThreadId: string,
  threadById: ReadonlyMap<string, BbThread>,
): boolean {
  let parentId = candidate.parentThreadId;
  for (let depth = 0; parentId !== null && depth < 10; depth++) {
    if (parentId === rootThreadId) return true;
    parentId = threadById.get(parentId)?.parentThreadId ?? null;
  }
  return false;
}

export default function plugin(bb: BbPluginApi) {
  const bindings = new TaskBindings(bb);
  void bindings.rebuild().catch((error: unknown) => {
    bb.log.warn(`Could not initialize task bindings: ${errorMessage(error)}`);
  });

  const publishOverviewChanged = () => {
    bb.realtime.publish("overview-changed", null);
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
  bb.events.on("thread.deleted", ({ thread }) => {
    bindings.forget(thread.id);
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

  bb.rpc.register(taskNavigatorRpc, {
    async ping() {
      const { tasks } = await listTasks(bb);
      const count = tasks.length;
      bb.log.info(`Tasks RPC ping: ${count} tasks`);
      await bindings.rebuild();
      return { count };
    },
    async overview() {
      const [{ tasks }, allThreads] = await Promise.all([
        listTasks(bb),
        bb.sdk.threads.list({ includeHidden: true, limit: MAX_THREAD_LIST_LIMIT }),
      ]);
      const threadById = new Map(
        allThreads.map((thread) => [thread.id, threadFacts(thread)]),
      );
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
        bindings.remember(task, taskThreads);
        const threads = taskThreads.map((taskThread) =>
          threadById.get(taskThread.threadId) ?? fallbackThreadFacts(taskThread)
        );
        const environments = [...new Set(
          threads.flatMap((thread) => thread.environmentId === null ? [] : [thread.environmentId]),
        )];
        const prs = (await Promise.all(environments.map(getPullRequest)))
          .filter((value): value is CachedPr => value !== null);
        const { next, lastMovedAt } = nextAndLastMoved(task, comments, threads, prs);
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
          lastMovedAt,
          waitingOn: derived.waitingOn,
          group: derived.group,
          reason: derived.reason,
          threads: threads.map(toThreadSummary),
          pullRequests: prs.flatMap((pr) => pr.pullRequest === null ? [] : [pr.pullRequest]),
        };
      }));
      const groups = {
        you: records.filter((record) => record.group === "you"),
        running: records.filter((record) => record.group === "running"),
        stalled: records.filter((record) => record.group === "stalled"),
        waiting: records.filter((record) => record.group === "waiting"),
      };
      const unfiled = allThreads
        .map(threadFacts)
        .filter((thread) => thread.parentThreadId === null && bindings.get(thread.id) === undefined)
        .map(toThreadSummary);
      const now = Date.now();
      const doneThisWeek = tasks.filter((task) =>
        task.status === "done"
        && withinCurrentWeek(parseTime(task.updatedAt) ?? 0, now)
      ).length;
      return overviewSchema.parse({ groups, unfiled, doneThisWeek });
    },
    async promoteThread({ threadId }) {
      const [thread, { projects }, allThreads] = await Promise.all([
        bb.sdk.threads.get({ threadId }),
        listProjects(bb),
        bb.sdk.threads.list({ includeHidden: true, limit: MAX_THREAD_LIST_LIMIT }),
      ]);
      const project = projects.find((candidate) =>
        candidate.linkedBbProjectId === thread.projectId
      );
      if (project === undefined) {
        throw new Error(`No task project is linked to BB project ${thread.projectId}`);
      }
      const result = await createTask(bb, {
        projectId: project.id,
        title: thread.title?.trim() || thread.titleFallback?.trim() || "Untitled thread",
      });
      if (!result.ok) throw new Error(result.error.message);
      const threadById = new Map(allThreads.map((candidate) => [candidate.id, candidate]));
      const attachedThreadIds = allThreads
        .filter((candidate) =>
          candidate.id === threadId || isDescendant(candidate, threadId, threadById)
        )
        .map((candidate) => candidate.id);
      if (!attachedThreadIds.includes(threadId)) attachedThreadIds.unshift(threadId);
      await Promise.all(attachedThreadIds.map((candidate) =>
        taskThreadsAttach(bb, result.task.id, candidate)
      ));
      bindings.remember(result.task, attachedThreadIds.map((candidate) => ({ threadId: candidate })));
      publishOverviewChanged();
      return { taskKey: taskKey(result.task), attachedThreadIds };
    },
  });
}
