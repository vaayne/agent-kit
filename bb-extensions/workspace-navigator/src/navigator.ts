import type { PluginSidebarProject, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export const WORKTREES_PAGE_SIZE = 5;
export const ENVIRONMENT_NAME_MAX_LENGTH = 80;
export const NOW_READ_RETENTION_MS = 30 * 60_000;

export interface NowReadRetention {
  viewedAt: number;
  attentionAt: number;
  expiresAt: number;
}

export type NowThreadReason =
  | "error"
  | "needs-you"
  | "running"
  | "unread"
  | "seen";

export type WorkStatusKind = "needs-you" | "running" | null;

export type EnvironmentNameNormalization =
  | { name: string | null; error: null }
  | { name: null; error: string };
export type SessionStatusKind = "error" | "needs-you" | "running" | "idle";
export type RollupStatusKind = Exclude<SessionStatusKind, "idle"> | null;

export interface WorktreeGroup {
  key: string;
  label: string;
  projectId: string;
  projectName: string;
  /** Null only for a thread that has no workspace to reuse. */
  environmentId: string | null;
  threads: readonly PluginSidebarThread[];
  workStatus: WorkStatusKind;
  latestAt: number;
}

export interface ProjectGroup {
  id: string;
  name: string;
  worktrees: readonly WorktreeGroup[];
  latestAt: number;
  hasWorkStatus: boolean;
}

function shortWorktreeId(key: string): string {
  return key.length > 10 ? `${key.slice(0, 10)}…` : key;
}

function disambiguateWorktreeLabels(
  worktrees: readonly WorktreeGroup[],
): WorktreeGroup[] {
  const countByLabel = new Map<string, number>();
  for (const worktree of worktrees) {
    countByLabel.set(
      worktree.label,
      (countByLabel.get(worktree.label) ?? 0) + 1,
    );
  }
  return worktrees.map((worktree) =>
    (countByLabel.get(worktree.label) ?? 0) > 1
      ? {
        ...worktree,
        label: `${worktree.label} · ${shortWorktreeId(worktree.key)}`,
      }
      : worktree
  );
}

function compareThreads(
  left: PluginSidebarThread,
  right: PluginSidebarThread,
): number {
  const updated = right.updatedAt - left.updatedAt;
  if (updated !== 0) return updated;
  return left.id.localeCompare(right.id);
}

export function threadTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim() || thread.titleFallback?.trim();
  return title || "Untitled session";
}

/** Compact, coarse timestamps keep session rows scannable in a narrow sidebar. */
export function relativeUpdatedAt(updatedAt: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - updatedAt) / 1_000));
  if (elapsedSeconds < 60) return "now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d`;

  return `${Math.floor(elapsedDays / 7)}w`;
}

export function needsYou(thread: PluginSidebarThread): boolean {
  return (
    thread.hasPendingInteraction
    || thread.indicator === "waiting-for-input"
    || thread.indicator === "unread-error"
  );
}

export function isRunning(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0
    || activity.backgroundAgents > 0
    || activity.backgroundCommands > 0
    || activity.planMode > 0
    || activity.goals > 0
    || thread.indicator === "runtime"
    || thread.indicator === "workflow"
    || thread.indicator === "background-agent"
    || thread.indicator === "background-command"
    || thread.indicator === "plan-mode"
    || thread.indicator === "goal"
  );
}

/** Only actionable or live work earns a session marker. */
export function sessionStatusFor(
  thread: PluginSidebarThread,
): SessionStatusKind {
  if (thread.indicator === "unread-error") return "error";
  if (needsYou(thread)) return "needs-you";
  if (isRunning(thread)) return "running";
  return "idle";
}

/** A collapsed parent speaks for hidden children with one prioritized glyph. */
export function rollupStatusFor(
  threads: readonly PluginSidebarThread[],
): RollupStatusKind {
  let rollup: RollupStatusKind = null;
  for (const thread of threads) {
    const status = sessionStatusFor(thread);
    if (status === "error") return "error";
    if (status === "needs-you") rollup = "needs-you";
    else if (status === "running" && rollup === null) rollup = "running";
  }
  return rollup;
}

export function workStatusFor(thread: PluginSidebarThread): WorkStatusKind {
  const status = sessionStatusFor(thread);
  if (status === "error" || status === "needs-you") return "needs-you";
  return status === "running" ? "running" : null;
}

export function worktreeKeyFor(thread: PluginSidebarThread): string {
  return thread.environment?.id ?? `projectless:${thread.projectId}`;
}

export function worktreeLabelFor(thread: PluginSidebarThread): string {
  return (
    thread.environment?.name?.trim()
    || thread.environment?.branchName?.trim()
    || (thread.environment ? "Workspace" : "No workspace")
  );
}

/** BB only archives environment groups backed by an actual worktree. */
export function canArchiveWorktree(worktree: WorktreeGroup): boolean {
  return worktree.threads.some(
    (thread) =>
      thread.environment !== null
      && thread.environment.workspaceDisplayKind !== "other",
  );
}

/** Mirrors the server contract before a menu form crosses the RPC boundary. */
export function normalizeEnvironmentName(
  value: string,
  currentName: string | null,
): EnvironmentNameNormalization {
  const name = value.trim();
  if (!name) {
    return currentName === null
      ? { name: null, error: "Environment name is required." }
      : { name: null, error: null };
  }
  if (name.length > ENVIRONMENT_NAME_MAX_LENGTH) {
    return {
      name: null,
      error: `Environment name must be ${ENVIRONMENT_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { name, error: null };
}

function groupWorktrees(
  threads: readonly PluginSidebarThread[],
  project: PluginSidebarProject,
): WorktreeGroup[] {
  const byWorktree = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    const key = worktreeKeyFor(thread);
    const group = byWorktree.get(key);
    if (group) group.push(thread);
    else byWorktree.set(key, [thread]);
  }

  const groups = Array.from(byWorktree, ([key, members]) => {
    const sorted = [...members].sort(compareThreads);
    const workStatus = sorted.reduce<WorkStatusKind>((current, thread) => {
      const next = workStatusFor(thread);
      if (current === "needs-you" || next === "needs-you") return "needs-you";
      return current ?? next;
    }, null);
    return {
      key,
      label: worktreeLabelFor(sorted[0]!),
      projectId: project.id,
      projectName: project.name,
      environmentId: sorted[0]?.environment?.id ?? null,
      threads: sorted,
      workStatus,
      latestAt: Math.max(...sorted.map((thread) => thread.updatedAt)),
    };
  });

  return disambiguateWorktreeLabels(groups).sort((left, right) => {
    const primaryOrder = worktreeSortPriority(left) - worktreeSortPriority(right);
    if (primaryOrder !== 0) return primaryOrder;
    const latestOrder = right.latestAt - left.latestAt;
    return latestOrder !== 0
      ? latestOrder
      : left.label.localeCompare(right.label);
  });
}

/** Keep the project's stable entry points ahead of disposable worktrees. */
function worktreeSortPriority(worktree: WorktreeGroup): number {
  const environment = worktree.threads[0]?.environment;
  if (environment?.branchName?.trim().toLowerCase() === "main") return 0;
  // "other" is the plugin API's plain checkout, rather than a worktree.
  if (environment?.workspaceDisplayKind === "other") return 1;
  return 2;
}

export function buildNavigator(
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
): {
  projects: readonly ProjectGroup[];
  pinned: readonly WorktreeGroup[];
  now: readonly PluginSidebarThread[];
} {
  const visible = threads.filter((thread) => !thread.isArchived);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const byProject = new Map<string, PluginSidebarThread[]>();
  for (const thread of visible) {
    const group = byProject.get(thread.projectId);
    if (group) group.push(thread);
    else byProject.set(thread.projectId, [thread]);
  }

  const projectIndexById = new Map(
    projects.map((project, index) => [project.id, index]),
  );
  const grouped = Array.from(byProject, ([projectId, members]) => {
    const project = projectById.get(projectId) ?? {
      id: projectId,
      name: "Personal",
      isPersonal: true,
    };
    const worktrees = groupWorktrees(members, project);
    return {
      id: project.id,
      name: project.name,
      worktrees,
      latestAt: Math.max(...worktrees.map((worktree) => worktree.latestAt)),
      hasWorkStatus: worktrees.some((worktree) => worktree.workStatus !== null),
    } satisfies ProjectGroup;
  }).sort((left, right) => {
    const leftIndex = projectIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = projectIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return left.name.localeCompare(right.name);
  });

  const now = visible
    .filter((thread) => sessionStatusFor(thread) !== "idle")
    .sort(compareThreads);

  const pinned = grouped
    .flatMap((project) =>
      project.worktrees
        .map((worktree) => {
          const threads = worktree.threads.filter((thread) => thread.isPinned);
          return {
            ...worktree,
            threads,
            latestAt: Math.max(...threads.map((thread) => thread.updatedAt)),
          };
        })
        .filter((worktree) => worktree.threads.length > 0)
    )
    .sort((left, right) => right.latestAt - left.latestAt);
  return { projects: grouped, pinned, now };
}

/**
 * Now is an attention shelf: live work stays until it ends, unread updates
 * stay until read, and a newly read update gets a short return-to-it buffer.
 */
export function nowThreadReason(
  thread: PluginSidebarThread,
  readRetention: ReadonlyMap<string, NowReadRetention>,
  now = Date.now(),
): NowThreadReason | null {
  if (thread.isArchived) return null;
  switch (sessionStatusFor(thread)) {
    case "error":
      return "error";
    case "needs-you":
      return "needs-you";
    case "running":
      return "running";
    case "idle":
      break;
  }
  if (thread.isUnread) return "unread";
  const retained = readRetention.get(thread.id);
  return retained?.attentionAt === thread.latestAttentionAt
      && now < retained.expiresAt
    ? "seen"
    : null;
}

export function selectNowThreads(
  threads: readonly PluginSidebarThread[],
  readRetention: ReadonlyMap<string, NowReadRetention>,
  now = Date.now(),
): readonly PluginSidebarThread[] {
  return threads
    .filter((thread) => nowThreadReason(thread, readRetention, now) !== null)
    .sort((left, right) => compareNowThreads(left, right, readRetention, now));
}

/** Notifications sort by attention time; freshly started work sorts by activity. */
function compareNowThreads(
  left: PluginSidebarThread,
  right: PluginSidebarThread,
  readRetention: ReadonlyMap<string, NowReadRetention>,
  now: number,
): number {
  const leftReason = nowThreadReason(left, readRetention, now);
  const rightReason = nowThreadReason(right, readRetention, now);
  const leftTime = leftReason === "running" ? left.updatedAt : left.latestAttentionAt;
  const rightTime = rightReason === "running" ? right.updatedAt : right.latestAttentionAt;
  const timeOrder = rightTime - leftTime;
  return timeOrder !== 0 ? timeOrder : compareThreads(left, right);
}

function visiblePage<T>(
  values: readonly T[],
  count: number,
  needsPriority: (value: T) => boolean,
): readonly T[] {
  const limit = Math.max(0, count);
  const priority = values.filter(needsPriority);
  const rest = values.filter((value) => !needsPriority(value));
  return [...priority, ...rest].slice(0, limit);
}

/** Live or actionable work enters the first visible page before idle history. */
export function visibleWorktrees(
  worktrees: readonly WorktreeGroup[],
  count: number,
): readonly WorktreeGroup[] {
  return visiblePage(
    worktrees,
    count,
    (worktree) => worktree.workStatus !== null,
  );
}

/** Live or actionable work enters the first visible page before idle history. */
export function visibleSessions(
  threads: readonly PluginSidebarThread[],
  count: number,
): readonly PluginSidebarThread[] {
  return visiblePage(
    threads,
    count,
    (thread) => sessionStatusFor(thread) !== "idle",
  );
}

export function matchesSearch(
  thread: PluginSidebarThread,
  query: string,
  projectName: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [threadTitle(thread), worktreeLabelFor(thread), projectName].some(
    (value) => value.toLocaleLowerCase().includes(needle),
  );
}
