import {
  experimental_NewThreadComposer as NewThreadComposer,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
  type PluginThreadListProps,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildNavigator,
  canArchiveWorktree,
  matchesSearch,
  normalizeEnvironmentName,
  NOW_READ_RETENTION_MS,
  type NowReadRetention,
  type NowThreadReason,
  nowThreadReason,
  type ProjectGroup,
  relativeUpdatedAt,
  rollupStatusFor,
  selectNowThreads,
  sessionStatusFor,
  type SessionStatusKind,
  threadTitle,
  visibleSessions,
  visibleWorktrees,
  type WorktreeGroup,
  WORKTREES_PAGE_SIZE,
} from "./navigator.js";
import { presentPullRequest } from "./pull-request.js";
import type { workspaceNavigatorRpc } from "./server.js";
import {
  describeUsageBody,
  formatUsageReset,
  formatUsageSummary,
  usageBarTone,
  type UsageLimitsResult,
  usagePlanLabel,
  type UsageProvider,
  type UsageProviderConfig,
  usageSummary,
  type UsageWindow,
  usageWindowValue,
  visibleUsageProviders,
} from "./usage.js";

/**
 * A directory, not an inbox: project ownership and workspace identity stay
 * visible all the way to a session. Visible rows own their status; a collapsed
 * parent has one glyph only for the sessions it hides.
 */
const PINNED_COLLAPSED_STORAGE_KEY = "bb-plugin-workspace-navigator:pinned-collapsed";
const USAGE_COLLAPSED_STORAGE_KEY = "bb-plugin-workspace-navigator:usage-collapsed";
const NOW_READ_RETENTION_STORAGE_KEY = "bb-plugin-workspace-navigator:now-read-retention";

function readPinnedCollapsed(): boolean {
  try {
    return (
      typeof window !== "undefined"
      && window.localStorage.getItem(PINNED_COLLAPSED_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

function readNowReadRetention(
  serialized: string | null | undefined = undefined,
): ReadonlyMap<string, NowReadRetention> {
  try {
    if (typeof window === "undefined" && serialized === undefined) {
      return new Map();
    }
    const raw = serialized === undefined
      ? window.localStorage.getItem(NOW_READ_RETENTION_STORAGE_KEY)
      : serialized;
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return new Map();
    const now = Date.now();
    const entries = Object.entries(parsed).flatMap(([threadId, value]) => {
      if (
        typeof value !== "object"
        || value === null
        || typeof (value as NowReadRetention).viewedAt !== "number"
        || typeof (value as NowReadRetention).attentionAt !== "number"
        || typeof (value as NowReadRetention).expiresAt !== "number"
        || (value as NowReadRetention).expiresAt <= now
      ) {
        return [];
      }
      return [[threadId, value as NowReadRetention] as const];
    });
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function mergeNowReadRetention(
  left: ReadonlyMap<string, NowReadRetention>,
  right: ReadonlyMap<string, NowReadRetention>,
): Map<string, NowReadRetention> {
  const merged = new Map(left);
  for (const [threadId, candidate] of right) {
    const existing = merged.get(threadId);
    if (
      !existing
      || candidate.attentionAt > existing.attentionAt
      || (candidate.attentionAt === existing.attentionAt
        && candidate.expiresAt > existing.expiresAt)
    ) {
      merged.set(threadId, candidate);
    }
  }
  return merged;
}

function persistNowReadRetention(
  retention: ReadonlyMap<string, NowReadRetention>,
): void {
  if (typeof window === "undefined") return;
  try {
    const merged = mergeNowReadRetention(readNowReadRetention(), retention);
    window.localStorage.setItem(
      NOW_READ_RETENTION_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(merged)),
    );
  } catch {
    // Storage is an enhancement only.
  }
}

function persistMergedNowReadRetention(
  retention: ReadonlyMap<string, NowReadRetention>,
): Map<string, NowReadRetention> {
  const merged = mergeNowReadRetention(readNowReadRetention(), retention);
  persistNowReadRetention(merged);
  return merged;
}

function sameNowReadRetention(
  left: ReadonlyMap<string, NowReadRetention>,
  right: ReadonlyMap<string, NowReadRetention>,
): boolean {
  return (
    left.size === right.size
    && [...left].every(([threadId, retained]) => right.get(threadId) === retained)
  );
}

function persistPinnedCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PINNED_COLLAPSED_STORAGE_KEY,
      String(collapsed),
    );
  } catch {
    // Privacy mode and storage quotas must not break sidebar navigation.
  }
}

function readUsageCollapsed(): boolean {
  try {
    return (
      typeof window === "undefined"
      || window.localStorage.getItem(USAGE_COLLAPSED_STORAGE_KEY) !== "false"
    );
  } catch {
    return true;
  }
}

function persistUsageCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USAGE_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Privacy mode and storage quotas must not break sidebar navigation.
  }
}

export function WorkspaceNavigator({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, projects, threads } = useSidebarThreads();
  const rpc = useRpc<typeof workspaceNavigatorRpc>();
  const [nowReadRetention, setNowReadRetention] = useState<ReadonlyMap<string, NowReadRetention>>(readNowReadRetention);
  const [nowTime, setNowTime] = useState(Date.now);
  const [usageResult, setUsageResult] = useState<UsageLimitsResult | null>(
    null,
  );
  const [usageLoading, setUsageLoading] = useState(true);
  const refreshUsage = useCallback(
    async (force: boolean) => {
      setUsageLoading(true);
      try {
        setUsageResult(await rpc.call("usageLimits", { force }));
      } catch (error) {
        setUsageResult({
          usage: null,
          fetchedAt: null,
          isStale: false,
          error: error instanceof Error && error.message
            ? error.message
            : "Could not load usage from the BB primary machine.",
        });
      } finally {
        setUsageLoading(false);
      }
    },
    [rpc],
  );
  useEffect(() => {
    void refreshUsage(false);
    const onFocus = () => void refreshUsage(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshUsage]);
  const [closedProjectIds, setClosedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [openedProjectIds, setOpenedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [closedWorktreeKeys, setClosedWorktreeKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [openedWorktreeKeys, setOpenedWorktreeKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const reconcileNowReadRetention = useCallback(
    (current: ReadonlyMap<string, NowReadRetention>, observedAt: number) => {
      const threadById = new Map(threads.map((thread) => [thread.id, thread]));
      const next = new Map(current);
      for (const [threadId, retained] of next) {
        const thread = threadById.get(threadId);
        const hasNewAttention = thread !== undefined
          && thread.latestAttentionAt > retained.attentionAt;
        if (retained.expiresAt <= observedAt || hasNewAttention) {
          next.delete(threadId);
        }
      }
      return next;
    },
    [threads],
  );
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NOW_READ_RETENTION_STORAGE_KEY) return;
      setNowReadRetention((current) => {
        const merged = mergeNowReadRetention(
          current,
          readNowReadRetention(event.newValue),
        );
        if (sameNowReadRetention(current, merged)) return current;
        persistNowReadRetention(merged);
        return merged;
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    const observedAt = Date.now();
    setNowReadRetention((current) => {
      const next = reconcileNowReadRetention(current, observedAt);
      if (sameNowReadRetention(current, next)) return current;
      persistNowReadRetention(next);
      return next;
    });
  }, [reconcileNowReadRetention]);
  useEffect(() => {
    if (nowReadRetention.size === 0) return;
    const nextWakeAt = Math.min(
      nowTime + 60_000,
      ...[...nowReadRetention.values()].map((retained) => retained.expiresAt),
    );
    if (!Number.isFinite(nextWakeAt)) return;
    const timeout = window.setTimeout(
      () => {
        const observedAt = Date.now();
        setNowTime(observedAt);
        setNowReadRetention((current) => {
          const next = reconcileNowReadRetention(current, observedAt);
          if (sameNowReadRetention(current, next)) return current;
          persistNowReadRetention(next);
          return next;
        });
      },
      Math.max(0, nextWakeAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [nowReadRetention, nowTime, reconcileNowReadRetention]);
  const retainNowThread = useCallback((thread: PluginSidebarThread) => {
    if (!thread.isUnread) return;
    const viewedAt = Date.now();
    const retained = {
      viewedAt,
      attentionAt: thread.latestAttentionAt,
      expiresAt: viewedAt + NOW_READ_RETENTION_MS,
    } satisfies NowReadRetention;
    setNowTime(viewedAt);
    setNowReadRetention((current) => {
      const next = new Map(current).set(thread.id, retained);
      return persistMergedNowReadRetention(next);
    });
  }, []);
  const navigator = useMemo(
    () => buildNavigator(threads, projects),
    [projects, threads],
  );
  const filtered = useMemo(
    () => filterNavigator(navigator.projects, searchQuery),
    [navigator.projects, searchQuery],
  );
  const filteredPinned = useMemo(
    () => filterWorktrees(navigator.pinned, searchQuery),
    [navigator.pinned, searchQuery],
  );
  const nowBreadcrumbByThreadId = useMemo(() => {
    const breadcrumbs = new Map<string, string>();
    for (const project of navigator.projects) {
      for (const worktree of project.worktrees) {
        for (const thread of worktree.threads) {
          breadcrumbs.set(thread.id, `${project.name} / ${worktree.label}`);
        }
      }
    }
    return breadcrumbs;
  }, [navigator.projects]);
  const nowThreads = useMemo(
    () => selectNowThreads(threads, nowReadRetention, nowTime),
    [nowReadRetention, nowTime, threads],
  );
  const filteredNow = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    if (!needle) return nowThreads;
    return nowThreads.filter((thread) =>
      [threadTitle(thread), nowBreadcrumbByThreadId.get(thread.id) ?? ""].some(
        (value) => value.toLocaleLowerCase().includes(needle),
      )
    );
  }, [nowBreadcrumbByThreadId, nowThreads, searchQuery]);
  const activeProjectId = threads.find(
    (thread) => thread.id === activeThreadId,
  )?.projectId;

  const toggleProject = (project: ProjectGroup) => {
    const isOpen = isProjectOpen({
      project,
      activeProjectId,
      closedIds: closedProjectIds,
      openedIds: openedProjectIds,
      searching: Boolean(searchQuery.trim()),
    });
    if (isOpen) {
      setClosedProjectIds((current) => new Set(current).add(project.id));
      setOpenedProjectIds((current) => without(current, project.id));
    } else {
      setClosedProjectIds((current) => without(current, project.id));
      setOpenedProjectIds((current) => new Set(current).add(project.id));
    }
  };

  const toggleWorktree = (worktree: WorktreeGroup, projectOpen: boolean) => {
    const isOpen = isWorktreeOpen({
      worktree,
      activeThreadId,
      closedKeys: closedWorktreeKeys,
      openedKeys: openedWorktreeKeys,
      searching: Boolean(searchQuery.trim()),
      projectOpen,
    });
    if (isOpen) {
      setClosedWorktreeKeys((current) => new Set(current).add(worktree.key));
      setOpenedWorktreeKeys((current) => without(current, worktree.key));
    } else {
      setClosedWorktreeKeys((current) => without(current, worktree.key));
      setOpenedWorktreeKeys((current) => new Set(current).add(worktree.key));
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
      <UsageSection
        result={usageResult}
        isLoading={usageLoading}
        onRefresh={() => void refreshUsage(true)}
      />

      {status !== "loading"
          && status !== "error"
          && filteredPinned.length > 0
        ? (
          <PinnedSection
            worktrees={filteredPinned}
            activeThreadId={activeThreadId}
            searching={Boolean(searchQuery.trim())}
            onNavigate={onNavigate}
          />
        )
        : null}

      {status !== "loading" && status !== "error" && filteredNow.length > 0
        ? (
          <NowSection
            threads={filteredNow}
            activeThreadId={activeThreadId}
            onNavigate={onNavigate}
            breadcrumbByThreadId={nowBreadcrumbByThreadId}
            onViewed={retainNowThread}
            readRetention={nowReadRetention}
            now={nowTime}
          />
        )
        : null}

      {status === "loading"
        ? null
        : status === "error"
        ? <EmptyState>Could not load sessions.</EmptyState>
        : filtered.length === 0
        ? (
          <EmptyState>
            {searchQuery.trim() ? "No sessions found" : "No sessions yet"}
          </EmptyState>
        )
        : (
          <section aria-label="Projects">
            <SectionHeading label="Projects" />
            <div className="space-y-1">
              {filtered.map((project) => {
                const open = isProjectOpen({
                  project,
                  activeProjectId,
                  closedIds: closedProjectIds,
                  openedIds: openedProjectIds,
                  searching: Boolean(searchQuery.trim()),
                });
                return (
                  <ProjectNode
                    key={project.id}
                    project={project}
                    activeThreadId={activeThreadId}
                    open={open}
                    searchQuery={searchQuery}
                    closedWorktreeKeys={closedWorktreeKeys}
                    openedWorktreeKeys={openedWorktreeKeys}
                    onNavigate={onNavigate}
                    onToggle={() => toggleProject(project)}
                    onToggleWorktree={(worktree) => toggleWorktree(worktree, open)}
                  />
                );
              })}
            </div>
          </section>
        )}
    </div>
  );
}

function ProjectNode({
  project,
  activeThreadId,
  open,
  searchQuery,
  closedWorktreeKeys,
  openedWorktreeKeys,
  onNavigate,
  onToggle,
  onToggleWorktree,
}: {
  project: ProjectGroup;
  activeThreadId: string | null;
  open: boolean;
  searchQuery: string;
  closedWorktreeKeys: ReadonlySet<string>;
  openedWorktreeKeys: ReadonlySet<string>;
  onNavigate: () => void;
  onToggle: () => void;
  onToggleWorktree: (worktree: WorktreeGroup) => void;
}) {
  const threads = project.worktrees.flatMap((worktree) => worktree.threads);
  return (
    <div>
      <button
        type="button"
        className="flex min-h-8 w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        aria-expanded={open}
        onClick={onToggle}
      >
        <FolderIcon />
        <span className="min-w-0 shrink truncate text-sm font-semibold tracking-tight">
          {project.name}
        </span>
        <Chevron open={open} />
        <span className="min-w-0 flex-1" />
        <CollapsedStatusRollup threads={threads} collapsed={!open} />
      </button>
      {open
        ? (
          <div className="space-y-1 px-0.5 py-1">
            <ProjectWorktreeShelves
              project={project}
              activeThreadId={activeThreadId}
              searchQuery={searchQuery}
              closedWorktreeKeys={closedWorktreeKeys}
              openedWorktreeKeys={openedWorktreeKeys}
              onNavigate={onNavigate}
              onToggleWorktree={onToggleWorktree}
            />
          </div>
        )
        : null}
    </div>
  );
}

function ProjectWorktreeShelves({
  project,
  activeThreadId,
  searchQuery,
  closedWorktreeKeys,
  openedWorktreeKeys,
  onNavigate,
  onToggleWorktree,
}: {
  project: ProjectGroup;
  activeThreadId: string | null;
  searchQuery: string;
  closedWorktreeKeys: ReadonlySet<string>;
  openedWorktreeKeys: ReadonlySet<string>;
  onNavigate: () => void;
  onToggleWorktree: (worktree: WorktreeGroup) => void;
}) {
  const [shownWorktreeCount, setShownWorktreeCount] = useState(WORKTREES_PAGE_SIZE);
  const worktrees = filterWorktrees(project.worktrees, searchQuery);
  const displayedWorktrees = visibleWorktrees(worktrees, shownWorktreeCount);
  const hiddenWorktrees = worktrees.length - displayedWorktrees.length;
  return (
    <div className="space-y-px">
      {displayedWorktrees.map((worktree) => {
        const open = isWorktreeOpen({
          worktree,
          activeThreadId,
          closedKeys: closedWorktreeKeys,
          openedKeys: openedWorktreeKeys,
          searching: Boolean(searchQuery.trim()),
          projectOpen: true,
        });
        return (
          <WorktreeNode
            key={worktree.key}
            worktree={worktree}
            open={open}
            activeThreadId={activeThreadId}
            onNavigate={onNavigate}
            onToggle={() => onToggleWorktree(worktree)}
          />
        );
      })}
      {hiddenWorktrees > 0
        ? (
          <PaginationButton
            hidden={hiddenWorktrees}
            indentClassName="pl-8"
            onClick={() => setShownWorktreeCount((count) => count + WORKTREES_PAGE_SIZE)}
          />
        )
        : null}
    </div>
  );
}

function UsageSection({
  result,
  isLoading,
  onRefresh,
}: {
  result: UsageLimitsResult | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readUsageCollapsed);
  const sourceDescriptionId = useId();
  const usage = result?.usage ?? null;
  const summary = useMemo(() => (usage ? usageSummary(usage) : null), [usage]);
  const summaryText = summary ? formatUsageSummary(summary) : null;
  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      persistUsageCollapsed(next);
      return next;
    });
  };

  return (
    <section aria-label="Usage" className="mb-3">
      <h2 className="mb-1">
        <div className="flex min-h-7 items-center gap-1 rounded px-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-describedby={sourceDescriptionId}
            aria-expanded={!collapsed}
            title="Usage data is from BB primary machine"
            onClick={toggle}
          >
            <span>Usage</span>
            <Chevron open={!collapsed} />
            <span className="min-w-0 flex-1" />
            {summary && summaryText
              ? (
                <span
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap font-normal normal-case"
                  aria-label={summaryText}
                >
                  {summary.items.map((item, index) => (
                    <span key={item.id}>
                      {index > 0 ? " · " : ""}
                      <span className={usageTextToneClass(item.usedPercent)}>
                        {item.name} {item.usedPercent}%
                      </span>
                    </span>
                  ))}
                  {summary.hiddenProviderCount > 0
                    ? ` · +${summary.hiddenProviderCount}`
                    : null}
                </span>
              )
              : null}
            {result?.isStale
              ? (
                <span className="shrink-0 font-normal normal-case text-muted-foreground">
                  Stale
                </span>
              )
              : null}
          </button>
          <button
            type="button"
            disabled={isLoading}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
            aria-describedby={sourceDescriptionId}
            aria-label={isLoading ? "Refreshing usage data" : "Refresh usage data"}
            title="Refresh usage data from BB primary machine"
            onClick={onRefresh}
          >
            <RefreshIcon spinning={isLoading} />
          </button>
          <span id={sourceDescriptionId} className="sr-only">
            Usage data is from BB primary machine.
          </span>
        </div>
      </h2>
      {!collapsed ? <UsageContent usage={usage} result={result} isLoading={isLoading} /> : null}
    </section>
  );
}

function UsageContent({
  usage,
  result,
  isLoading,
}: {
  usage: UsageLimitsResult["usage"];
  result: UsageLimitsResult | null;
  isLoading: boolean;
}) {
  if (!usage) {
    return (
      <p role="status" className="px-1.5 py-1 text-xs text-muted-foreground">
        {isLoading
          ? "Loading usage…"
          : (result?.error ?? "Usage unavailable from BB primary machine.")}
      </p>
    );
  }

  return (
    <div className="space-y-2 px-1.5 py-1">
      {result?.isStale
        ? (
          <p role="status" className="text-2xs text-muted-foreground">
            Stale cached data{result.error ? ` · ${result.error}` : ""}
          </p>
        )
        : result?.error
        ? (
          <p role="status" className="text-2xs text-muted-foreground">
            {result.error}
          </p>
        )
        : null}
      {visibleUsageProviders(usage).map((entry) => (
        <UsageProviderBlock
          key={entry.config.id}
          config={entry.config}
          usage={entry.usage}
        />
      ))}
    </div>
  );
}

function UsageProviderBlock({
  config,
  usage,
}: {
  config: UsageProviderConfig;
  usage: UsageProvider;
}) {
  const body = describeUsageBody({ config, usage, isLoading: false });
  const planLabel = usagePlanLabel(usage);
  return (
    <section className="space-y-1.5 py-1.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline gap-1.5">
        <h3 className="text-xs font-medium text-sidebar-foreground">
          {config.name}
        </h3>
        {planLabel
          ? (
            <span className="truncate text-2xs text-muted-foreground">
              {planLabel}
            </span>
          )
          : null}
      </div>
      {body.kind === "windows"
        ? (
          <div className="space-y-2">
            {body.windows.map((window) => <UsageWindowRow key={window.label} window={window} />)}
          </div>
        )
        : body.kind === "message"
        ? <p className="text-xs text-muted-foreground">{body.text}</p>
        : null}
    </section>
  );
}

function UsageWindowRow({ window }: { window: UsageWindow }) {
  const reset = formatUsageReset(window.resetsAt);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-sidebar-foreground">
          {window.label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {usageWindowValue(window)}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-sidebar-accent">
        <div
          className={`h-full rounded-full ${usageBarClass(window.usedPercent)}`}
          style={{ width: `${window.usedPercent}%` }}
        />
      </div>
      {reset ? <p className="text-2xs text-muted-foreground">{reset}</p> : null}
    </div>
  );
}

function usageBarClass(usedPercent: number): string {
  switch (usageBarTone(usedPercent)) {
    case "warning":
      return "bg-warning";
    case "destructive":
      return "bg-destructive";
    case "muted":
      return "bg-muted-foreground";
  }
}

function usageTextToneClass(usedPercent: number): string {
  switch (usageBarTone(usedPercent)) {
    case "warning":
      return "text-warning";
    case "destructive":
      return "text-destructive";
    case "muted":
      return "text-muted-foreground";
  }
}

function PinnedSection({
  worktrees,
  activeThreadId,
  searching,
  onNavigate,
}: {
  worktrees: readonly WorktreeGroup[];
  activeThreadId: string | null;
  searching: boolean;
  onNavigate: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readPinnedCollapsed);
  const expanded = searching || !collapsed;
  const { threads, breadcrumbByThreadId } = useMemo(() => {
    const breadcrumbByThreadId = new Map<string, string>();
    const threads: PluginSidebarThread[] = [];
    for (const worktree of worktrees) {
      for (const thread of worktree.threads) {
        threads.push(thread);
        breadcrumbByThreadId.set(
          thread.id,
          `${worktree.projectName} / ${worktree.label}`,
        );
      }
    }
    return { threads, breadcrumbByThreadId };
  }, [worktrees]);

  const toggle = () => {
    if (searching) return;
    setCollapsed((current) => {
      const next = !current;
      persistPinnedCollapsed(next);
      return next;
    });
  };

  return (
    <section aria-label="Pinned" className="mb-3">
      <h2 className="mb-1">
        <button
          type="button"
          className="flex min-h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-disabled={searching}
          aria-expanded={expanded}
          onClick={toggle}
        >
          <span>Pinned</span>
          <Chevron open={expanded} />
          <span className="font-normal normal-case text-muted-foreground">
            {threads.length}
          </span>
          <span className="min-w-0 flex-1" />
          <CollapsedStatusRollup threads={threads} collapsed={!expanded} />
        </button>
      </h2>
      {expanded
        ? (
          <SessionList
            threads={threads}
            activeThreadId={activeThreadId}
            onNavigate={onNavigate}
            breadcrumbByThreadId={breadcrumbByThreadId}
            indented={false}
          />
        )
        : null}
    </section>
  );
}

function NowSection({
  threads,
  activeThreadId,
  onNavigate,
  breadcrumbByThreadId,
  onViewed,
  readRetention,
  now,
}: {
  threads: readonly PluginSidebarThread[];
  activeThreadId: string | null;
  onNavigate: () => void;
  breadcrumbByThreadId: ReadonlyMap<string, string>;
  onViewed: (thread: PluginSidebarThread) => void;
  readRetention: ReadonlyMap<string, NowReadRetention>;
  now: number;
}) {
  const reasonByThreadId = new Map<string, string>();
  for (const thread of threads) {
    const reason = nowThreadReason(thread, readRetention, now);
    if (reason) {
      reasonByThreadId.set(
        thread.id,
        formatNowReason(reason, readRetention.get(thread.id)?.viewedAt, now),
      );
    }
  }
  return (
    <section aria-label="Now" className="mb-3">
      <SectionHeading label={`Now · ${threads.length}`} />
      <SessionList
        threads={threads}
        activeThreadId={activeThreadId}
        onNavigate={onNavigate}
        breadcrumbByThreadId={breadcrumbByThreadId}
        indented={false}
        onViewed={onViewed}
        preserveOrder
        nowReasonByThreadId={reasonByThreadId}
      />
    </section>
  );
}

function WorktreeNode({
  worktree,
  open,
  activeThreadId,
  onNavigate,
  onToggle,
}: {
  worktree: WorktreeGroup;
  open: boolean;
  activeThreadId: string | null;
  onNavigate: () => void;
  onToggle: () => void;
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  return (
    <div className="group/worktree relative">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 pl-3 pr-1 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-expanded={open}
          onClick={onToggle}
        >
          <WorktreeIcon />
          <span className="min-w-0 shrink truncate font-mono">
            {worktree.label}
          </span>
          <Chevron open={open} />
          <span className="min-w-0 flex-1" />
          <CollapsedStatusRollup threads={worktree.threads} collapsed={!open} />
        </button>
        <WorktreeActions
          worktree={worktree}
          onNewSession={() => setComposerOpen(true)}
        />
      </div>
      <WorktreePullRequest worktree={worktree} />
      {composerOpen
        ? (
          <WorktreeComposer
            worktree={worktree}
            onCreated={() => {
              setComposerOpen(false);
              onNavigate();
            }}
          />
        )
        : null}
      {open
        ? (
          <SessionList
            threads={worktree.threads}
            activeThreadId={activeThreadId}
            onNavigate={onNavigate}
          />
        )
        : null}
    </div>
  );
}

function WorktreePullRequest({ worktree }: { worktree: WorktreeGroup }) {
  const rpc = useRpc<typeof workspaceNavigatorRpc>();
  const [state, setState] = useState<
    {
      pullRequest: Parameters<typeof presentPullRequest>[0] | null;
      isStale: boolean;
    } | null
  >(null);
  useEffect(() => {
    if (!worktree.environmentId) return;
    let cancelled = false;
    void rpc
      .call("pullRequest", { environmentId: worktree.environmentId })
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => {
        if (!cancelled) setState({ pullRequest: null, isStale: true });
      });
    return () => {
      cancelled = true;
    };
  }, [rpc, worktree.environmentId]);
  if (!state?.pullRequest) return null;
  const presentation = presentPullRequest(state.pullRequest);
  return (
    <a
      href={state.pullRequest.url}
      target="_blank"
      rel="noreferrer"
      title={`${state.pullRequest.title} · ${presentation.label}`}
      aria-label={`Open pull request #${state.pullRequest.number}: ${presentation.label}`}
      className="ml-8 flex min-h-5 items-center text-2xs text-muted-foreground hover:text-sidebar-foreground hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      PR #{state.pullRequest.number} · {presentation.label}
      {state.isStale ? " · stale" : ""}
    </a>
  );
}

type WorktreeActionsView = "actions" | "archive" | "rename";

function WorktreeActions({
  worktree,
  onNewSession,
  className,
}: {
  worktree: WorktreeGroup;
  onNewSession: () => void;
  className?: string;
}) {
  const rpc = useRpc<typeof workspaceNavigatorRpc>();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<WorktreeActionsView>("actions");
  const [archiving, setArchiving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const environmentId = worktree.environmentId;
  const currentName = worktree.threads[0]?.environment?.name ?? null;
  const archiveable = canArchiveWorktree(worktree);

  const closeMenu = useCallback(
    (restoreFocus = true) => {
      if (archiving || renaming) return;
      setMenuOpen(false);
      setView("actions");
      if (restoreFocus) {
        queueMicrotask(() => triggerRef.current?.focus({ preventScroll: true }));
      }
    },
    [archiving, renaming],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => {
      if (view === "rename") {
        nameInputRef.current?.focus({ preventScroll: true });
        return;
      }
      menuRef.current
        ?.querySelector<HTMLButtonElement>(
          "[data-worktree-menu-item], [data-worktree-menu-focus]",
        )
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [menuOpen, view]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        menuRef.current?.contains(target)
        || triggerRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, menuOpen]);

  if (!environmentId) return null;

  const archive = async () => {
    setArchiving(true);
    setArchiveError(null);
    try {
      await rpc.call("archiveWorktree", { environmentId });
      setMenuOpen(false);
      setView("actions");
    } catch (error) {
      setArchiveError(
        error instanceof Error && error.message
          ? error.message
          : "Could not archive this worktree.",
      );
    } finally {
      setArchiving(false);
    }
  };

  const rename = async () => {
    const normalized = normalizeEnvironmentName(renameValue, currentName);
    if (normalized.error) {
      setRenameError(normalized.error);
      return;
    }

    setRenaming(true);
    setRenameError(null);
    try {
      await rpc.call("renameWorktree", {
        environmentId,
        name: normalized.name,
      });
      setMenuOpen(false);
      setView("actions");
    } catch (error) {
      setRenameError(
        error instanceof Error && error.message
          ? error.message
          : "Could not rename this worktree.",
      );
    } finally {
      setRenaming(false);
    }
  };

  const onActionsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-worktree-menu-item]:not(:disabled)",
      ),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
      ? items.length - 1
      : event.key === "ArrowUp"
      ? (current + items.length - 1) % items.length
      : (current + 1) % items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  return (
    <span className={`relative shrink-0 ${className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-controls={menuOpen ? menuId : undefined}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Worktree actions for ${worktree.label}`}
        className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        onClick={() => {
          if (menuOpen) {
            closeMenu();
            return;
          }
          setArchiveError(null);
          setRenameError(null);
          setView("actions");
          setMenuOpen(true);
        }}
      >
        <MoreHorizontalIcon />
      </button>
      {menuOpen
        ? (
          <div
            ref={menuRef}
            id={menuId}
            className="absolute right-0 top-6 z-20 min-w-48 rounded-md border border-sidebar-border bg-sidebar p-1 text-xs shadow-md"
          >
            {view === "archive"
              ? (
                <div className="space-y-2 p-1.5" aria-label="Archive worktree">
                  <p className="text-sidebar-foreground">
                    Archive this worktree and its sessions?
                  </p>
                  <p className="text-2xs text-muted-foreground">
                    BB removes a managed worktree after its last session is archived. External and COW directories stay
                    on disk.
                  </p>
                  {archiveError
                    ? (
                      <p role="alert" className="text-2xs text-destructive">
                        {archiveError}
                      </p>
                    )
                    : null}
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={archiving}
                      data-worktree-menu-focus=""
                      className="rounded px-2 py-1 hover:bg-sidebar-accent disabled:opacity-50"
                      onClick={() => setView("actions")}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={archiving}
                      className="rounded bg-destructive/15 px-2 py-1 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                      onClick={() => void archive()}
                    >
                      {archiving ? "Archiving…" : "Archive worktree"}
                    </button>
                  </div>
                </div>
              )
              : view === "rename"
              ? (
                <form
                  className="space-y-2 p-1.5"
                  aria-label="Rename worktree"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename();
                  }}
                >
                  <label className="block space-y-1 text-sidebar-foreground">
                    <span>Worktree name</span>
                    <input
                      ref={nameInputRef}
                      value={renameValue}
                      maxLength={80}
                      disabled={renaming}
                      className="h-7 w-full rounded border border-sidebar-border bg-sidebar px-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-sidebar-ring disabled:opacity-50"
                      placeholder="Worktree name"
                      onChange={(event) => {
                        setRenameValue(event.target.value);
                        setRenameError(null);
                      }}
                    />
                  </label>
                  {renameError
                    ? (
                      <p role="alert" className="text-2xs text-destructive">
                        {renameError}
                      </p>
                    )
                    : null}
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={renaming}
                      data-worktree-menu-focus=""
                      className="rounded px-2 py-1 hover:bg-sidebar-accent disabled:opacity-50"
                      onClick={() => setView("actions")}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={renaming}
                      className="rounded bg-sidebar-accent px-2 py-1 text-sidebar-foreground hover:bg-sidebar-border disabled:opacity-50"
                    >
                      {renaming ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              )
              : (
                <div
                  role="menu"
                  aria-label="Worktree actions"
                  onKeyDown={onActionsKeyDown}
                >
                  <button
                    type="button"
                    role="menuitem"
                    data-worktree-menu-item=""
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent"
                    onClick={() => {
                      closeMenu(false);
                      onNewSession();
                    }}
                  >
                    New session
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    data-worktree-menu-item=""
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent"
                    onClick={() => {
                      setRenameError(null);
                      setRenameValue(currentName ?? "");
                      setView("rename");
                    }}
                  >
                    Rename
                  </button>
                  {archiveable
                    ? (
                      <button
                        type="button"
                        role="menuitem"
                        data-worktree-menu-item=""
                        className="w-full rounded px-2 py-1.5 text-left text-destructive hover:bg-sidebar-accent focus-visible:outline-none focus-visible:bg-sidebar-accent"
                        onClick={() => {
                          setArchiveError(null);
                          setView("archive");
                        }}
                      >
                        Archive worktree
                      </button>
                    )
                    : (
                      <button
                        type="button"
                        role="menuitem"
                        disabled
                        title="Unavailable for regular workspace"
                        className="w-full cursor-not-allowed rounded px-2 py-1.5 text-left text-muted-foreground opacity-60"
                      >
                        <span className="block">Archive worktree</span>
                        <span className="block text-2xs">
                          Unavailable for regular workspace
                        </span>
                      </button>
                    )}
                </div>
              )}
          </div>
        )
        : null}
    </span>
  );
}

function WorktreeComposer({
  worktree,
  onCreated,
}: {
  worktree: WorktreeGroup;
  onCreated: () => void;
}) {
  const rpc = useRpc<typeof workspaceNavigatorRpc>();
  const actions = useSidebarThreadActions();
  if (!worktree.environmentId) return null;
  return (
    <div className="my-1 rounded-md border border-sidebar-border bg-sidebar p-2">
      <NewThreadComposer
        defaultProjectId={worktree.projectId}
        defaultEnvironment={{
          type: "reuse",
          environmentId: worktree.environmentId,
        }}
        draftKey={`workspace-navigator:new:${worktree.environmentId}`}
        focusRequest={1}
        layout="document"
        placeholder={`Start a session in ${worktree.label}…`}
        onSubmit={async (request) => {
          const { threadId } = await rpc.call("createThread", { request });
          actions.open(threadId);
          onCreated();
        }}
      />
    </div>
  );
}

function SessionList({
  threads,
  activeThreadId,
  onNavigate,
  breadcrumbByThreadId,
  indented = true,
  onViewed,
  preserveOrder = false,
  nowReasonByThreadId,
}: {
  threads: readonly PluginSidebarThread[];
  activeThreadId: string | null;
  onNavigate: () => void;
  breadcrumbByThreadId?: ReadonlyMap<string, string>;
  indented?: boolean;
  onViewed?: (thread: PluginSidebarThread) => void;
  preserveOrder?: boolean;
  nowReasonByThreadId?: ReadonlyMap<string, string>;
}) {
  const [shownSessionCount, setShownSessionCount] = useState(WORKTREES_PAGE_SIZE);
  const displayedSessions = preserveOrder
    ? threads.slice(0, shownSessionCount)
    : visibleSessions(threads, shownSessionCount);
  const hiddenSessions = threads.length - displayedSessions.length;
  return (
    <ul className={`space-y-px ${indented ? "pl-5" : ""}`}>
      {displayedSessions.map((thread) => (
        <SessionRow
          key={thread.id}
          thread={thread}
          active={thread.id === activeThreadId}
          breadcrumb={breadcrumbByThreadId?.get(thread.id)}
          onNavigate={onNavigate}
          onViewed={onViewed}
          nowReason={nowReasonByThreadId?.get(thread.id)}
        />
      ))}
      {hiddenSessions > 0
        ? (
          <li className="list-none">
            <PaginationButton
              hidden={hiddenSessions}
              indentClassName="pl-7"
              onClick={() => setShownSessionCount((count) => count + WORKTREES_PAGE_SIZE)}
            />
          </li>
        )
        : null}
    </ul>
  );
}

function PaginationButton({
  hidden,
  indentClassName,
  onClick,
}: {
  hidden: number;
  indentClassName: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`mt-1 flex min-h-6 w-full items-center justify-start rounded pr-2 text-2xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${indentClassName}`}
      onClick={onClick}
    >
      Show {WORKTREES_PAGE_SIZE} more · {hidden} hidden
    </button>
  );
}

function formatNowReason(
  reason: NowThreadReason,
  viewedAt: number | undefined,
  now: number,
): string {
  switch (reason) {
    case "error":
      return "Error";
    case "needs-you":
      return "Needs input";
    case "running":
      return "Running";
    case "unread":
      return "Unread";
    case "seen":
      return `Seen ${viewedAt === undefined ? "now" : relativeUpdatedAt(viewedAt, now)}`;
  }
}

function SessionRow({
  thread,
  active,
  breadcrumb,
  onNavigate,
  onViewed,
  nowReason,
}: {
  thread: PluginSidebarThread;
  active: boolean;
  breadcrumb?: string;
  onNavigate: () => void;
  onViewed?: (thread: PluginSidebarThread) => void;
  nowReason?: string;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const sessionStatus = sessionStatusFor(thread);
  return (
    <li className="group/session relative min-w-0 list-none">
      <a
        href="#"
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        {...splitProps}
        aria-label={breadcrumb
          ? `${threadTitle(thread)} · ${breadcrumb}`
          : threadTitle(thread)}
        title={breadcrumb ? `${breadcrumb} / ${threadTitle(thread)}` : undefined}
        onClick={(event) => {
          event.preventDefault();
          onViewed?.(thread);
          if (onViewed && thread.isUnread) {
            // Opening a Now notification is acknowledgement, not just navigation.
            void actions.setRead(thread.id, true);
          }
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
        className={`flex min-h-7 items-center gap-1.5 rounded px-1.5 text-xs outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 ${
          active ? "bg-sidebar-accent font-medium" : ""
        } ${!active && layout !== null ? "bg-sidebar-accent/40" : ""}`}
      >
        <SessionStatusGlyph status={sessionStatus} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{threadTitle(thread)}</span>
          {nowReason
            ? (
              <span className="block truncate text-2xs font-normal text-muted-foreground">
                {nowReason}
              </span>
            )
            : null}
        </span>
        <span className="flex w-16 shrink-0 justify-end text-2xs tabular-nums text-muted-foreground group-hover/session:invisible group-focus-within/session:invisible">
          {relativeUpdatedAt(
            nowReason ? thread.latestAttentionAt : thread.updatedAt,
          )}
        </span>
      </a>
      <span className="absolute inset-y-0 right-1 hidden w-16 items-center justify-end gap-px group-hover/session:flex group-focus-within/session:flex">
        <button
          type="button"
          aria-label={thread.isPinned ? "Unpin session" : "Pin session"}
          className={`flex size-5 items-center justify-center rounded hover:bg-sidebar-border hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
            thread.isPinned ? "text-sidebar-foreground" : "text-muted-foreground"
          }`}
          onClick={() => void actions.setPinned(thread.id, !thread.isPinned)}
        >
          <PinIcon />
        </button>
        <button
          type="button"
          aria-label="Archive session"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={() => actions.archive(thread.id)}
        >
          <ArchiveIcon />
        </button>
        <button
          type="button"
          aria-label="Session actions"
          aria-expanded={menuOpen}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontalIcon />
        </button>
      </span>
      {menuOpen
        ? (
          <div className="absolute right-1 top-7 z-10 flex min-w-28 flex-col rounded-md border border-sidebar-border bg-sidebar p-1 text-xs shadow-md">
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-sidebar-accent"
              onClick={() => {
                setMenuOpen(false);
                void actions.setRead(thread.id, thread.isUnread);
              }}
            >
              Mark {thread.isUnread ? "read" : "unread"}
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-left hover:bg-sidebar-accent"
              onClick={() => {
                setMenuOpen(false);
                actions.requestDelete(thread.id);
              }}
            >
              Delete…
            </button>
          </div>
        )
        : null}
    </li>
  );
}

function CollapsedStatusRollup({
  threads,
  collapsed,
}: {
  threads: readonly PluginSidebarThread[];
  collapsed: boolean;
}) {
  if (!collapsed) return null;
  const status = rollupStatusFor(threads);
  return status ? <SessionStatusGlyph status={status} /> : null;
}

function SessionStatusGlyph({ status }: { status: SessionStatusKind }) {
  const slotClassName = "flex size-4 shrink-0 items-center justify-center";
  switch (status) {
    case "error":
      return (
        <span
          aria-label="Error"
          className={`${slotClassName} text-destructive`}
        >
          <ErrorIcon />
        </span>
      );
    case "needs-you":
      return (
        <span
          aria-label="Needs input"
          className={`${slotClassName} text-attention`}
        >
          <NeedsInputIcon />
        </span>
      );
    case "running":
      return (
        <span aria-label="Running" className={slotClassName}>
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border border-attention border-t-transparent"
          />
        </span>
      );
    case "idle":
      return <span className={slotClassName} />;
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`size-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 3 5 5-5 5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0 text-sidebar-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.1l1.7 2.25H18a2.25 2.25 0 0 1 2.25 2.25v6.75A2.25 2.25 0 0 1 18 18H6a2.25 2.25 0 0 1-2.25-2.25Z" />
    </svg>
  );
}

function WorktreeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="5" r="1.75" />
      <circle cx="18" cy="7" r="1.75" />
      <circle cx="18" cy="18" r="1.75" />
      <path d="M7.75 5h2.5A3.75 3.75 0 0 1 14 8.75v5.5A3.75 3.75 0 0 0 17.75 18" />
      <path d="M14 8.75A3.75 3.75 0 0 1 17.75 7" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`size-3.5 ${spinning ? "animate-spin" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 6.5A5.25 5.25 0 1 0 13.1 10" />
      <path d="M13 2.75v3.75H9.25" />
    </svg>
  );
}

function MoreHorizontalIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="currentColor"
    >
      <circle cx="3" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21 8 16" />
      <path d="M13.26 18.87C9.52 18.02 5.98 14.48 5.13 10.74c-.14-.59-.2-.89 0-1.37.19-.48.43-.63.9-.92 1.08-.68 2.24-.89 3.45-.78 1.7.15 2.55.23 2.97 0 .42-.22.71-.74 1.29-1.77l.73-1.31c.48-.86.72-1.29 1.28-1.5.56-.2.9-.08 1.58.17 1.59.57 2.82 1.81 3.4 3.4.25.68.37 1.02.17 1.58-.2.56-.63.8-1.5 1.28l-1.34.75c-1.03.57-1.54.86-1.77 1.29-.22.43-.14 1.26.02 2.92.12 1.22-.08 2.39-.77 3.48-.3.48-.45.72-.93.92-.48.19-.78.12-1.37-.01Z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 5.5h11v8h-11zM2 2.5h12v3H2zM6 8.5h4" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="5.5" />
      <path d="m6 6 4 4m0-4-4 4" />
    </svg>
  );
}

function NeedsInputIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 2.25 14 13H2Z" />
      <path d="M8 5.5v3.25M8 11v.1" />
    </svg>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h2 className="mb-1 px-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      {label}
    </h2>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <p
      role="status"
      className="px-3 py-6 text-center text-xs text-muted-foreground"
    >
      {children}
    </p>
  );
}

function filterNavigator(
  projects: readonly ProjectGroup[],
  query: string,
): ProjectGroup[] {
  return projects
    .map((project) => ({
      ...project,
      worktrees: filterWorktrees(project.worktrees, query),
    }))
    .filter((project) => project.worktrees.length > 0);
}

function filterWorktrees(
  worktrees: readonly WorktreeGroup[],
  query: string,
): WorktreeGroup[] {
  return worktrees
    .map((worktree) => {
      const threads = worktree.threads.filter((thread) => matchesSearch(thread, query, worktree.projectName));
      return {
        ...worktree,
        threads,
        workStatus: threads.reduce<WorktreeGroup["workStatus"]>(
          (current, thread) => {
            const status = sessionStatusFor(thread);
            const next = status === "error" || status === "needs-you"
              ? "needs-you"
              : status === "running"
              ? "running"
              : null;
            if (current === "needs-you" || next === "needs-you") {
              return "needs-you";
            }
            return current ?? next;
          },
          null,
        ),
        latestAt: Math.max(...threads.map((thread) => thread.updatedAt)),
      };
    })
    .filter((worktree) => worktree.threads.length > 0);
}

function isProjectOpen({
  project,
  activeProjectId,
  closedIds,
  openedIds,
  searching,
}: {
  project: ProjectGroup;
  activeProjectId: string | undefined;
  closedIds: ReadonlySet<string>;
  openedIds: ReadonlySet<string>;
  searching: boolean;
}): boolean {
  if (searching) return true;
  if (closedIds.has(project.id)) return false;
  return (
    openedIds.has(project.id)
    || project.hasWorkStatus
    || project.id === activeProjectId
  );
}

function isWorktreeOpen({
  worktree,
  activeThreadId,
  closedKeys,
  openedKeys,
  searching,
  projectOpen,
}: {
  worktree: WorktreeGroup;
  activeThreadId: string | null;
  closedKeys: ReadonlySet<string>;
  openedKeys: ReadonlySet<string>;
  searching: boolean;
  projectOpen: boolean;
}): boolean {
  if (!projectOpen) return false;
  if (searching) return true;
  if (closedKeys.has(worktree.key)) return false;
  return (
    openedKeys.has(worktree.key)
    || worktree.workStatus !== null
    || worktree.threads.some((thread) => thread.id === activeThreadId)
  );
}

function without(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  next.delete(id);
  return next;
}
