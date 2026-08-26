import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRealtime,
  useRpc,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Overview, OverviewTask, ThreadSummary, taskNavigatorRpc } from "./server.js";

const FILTER_STORAGE_KEY = "bb-plugin-task-navigator:projects";
const OTHER_COLLAPSED_STORAGE_KEY = "bb-plugin-task-navigator:other-collapsed";
const THREE_DAYS_MS = 3 * 24 * 60 * 60_000;

type GroupName = "you" | "running" | "other";

function readProjectSelection(): Set<string> | null {
  try {
    const value = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? new Set(parsed)
      : null;
  } catch {
    return null;
  }
}

function saveProjectSelection(selection: Set<string> | null): void {
  try {
    if (selection === null) window.localStorage.removeItem(FILTER_STORAGE_KEY);
    else window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify([...selection]));
  } catch {
    // Sidebar preferences are an enhancement only.
  }
}

function readOtherCollapsed(): boolean {
  try {
    return window.localStorage.getItem(OTHER_COLLAPSED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function saveOtherCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(OTHER_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Sidebar preferences are an enhancement only.
  }
}

function relativeUpdatedAt(timestamp: number | null, now = Date.now()): string {
  if (timestamp === null) return "—";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function projectKey(task: OverviewTask): string {
  return task.key.split("-", 1)[0] ?? task.key;
}

function taskMatches(task: OverviewTask, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    task.key,
    task.title,
    task.next ?? "",
    ...task.threads.map((thread) => thread.title),
  ].some((value) => value.toLocaleLowerCase().includes(needle));
}

export function TaskSidebar({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const actions = useSidebarThreadActions();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectSelection, setProjectSelection] = useState<Set<string> | null>(readProjectSelection);
  const [otherCollapsed, setOtherCollapsed] = useState(readOtherCollapsed);
  const [promotingThreadId, setPromotingThreadId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);

  const load = useCallback(async () => {
    try {
      setOverview(await rpc.call("overview", {}));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load tasks.");
    }
  }, [rpc]);
  useEffect(() => {
    void load();
  }, [load]);
  const onOverviewChanged = useCallback(() => {
    void load();
  }, [load]);
  useRealtime("overview-changed", onOverviewChanged);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const projects = useMemo(() => {
    if (overview === null) return [];
    const tasks = [
      ...overview.groups.you,
      ...overview.groups.running,
      ...overview.groups.stalled,
      ...overview.groups.waiting,
    ];
    return [...new Set(tasks.map(projectKey))].sort((left, right) => left.localeCompare(right));
  }, [overview]);
  const selectedProjects = projectSelection === null
    ? new Set(projects)
    : new Set([...projectSelection].filter((project) => projects.includes(project)));
  const filterTask = useCallback((task: OverviewTask) =>
    selectedProjects.has(projectKey(task)) && taskMatches(task, searchQuery),
  [searchQuery, selectedProjects]);
  const you = overview?.groups.you.filter(filterTask) ?? [];
  const running = overview?.groups.running.filter(filterTask) ?? [];
  const other = [
    ...(overview?.groups.stalled ?? []),
    ...(overview?.groups.waiting ?? []),
  ].filter(filterTask);
  const unfiled = (overview?.unfiled ?? []).filter((thread) => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return !needle || thread.title.toLocaleLowerCase().includes(needle);
  });

  const toggleProject = (project: string) => {
    const next = new Set(selectedProjects);
    if (next.has(project)) next.delete(project);
    else next.add(project);
    const normalized = next.size === projects.length ? null : next;
    setProjectSelection(normalized);
    saveProjectSelection(normalized);
  };
  const toggleOther = () => {
    const next = !otherCollapsed;
    setOtherCollapsed(next);
    saveOtherCollapsed(next);
  };
  const promote = async (thread: ThreadSummary) => {
    setPromotingThreadId(thread.id);
    try {
      await rpc.call("promoteThread", { threadId: thread.id });
      actions.open(thread.id);
      onNavigate();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not promote thread.");
    } finally {
      setPromotingThreadId(null);
    }
  };

  if (error !== null && overview === null) {
    return <p className="px-2 py-3 text-xs text-destructive">{error}</p>;
  }
  if (overview === null) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">Loading tasks…</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
      <ProjectFilters projects={projects} selected={selectedProjects} onToggle={toggleProject} />
      <TaskGroup
        label="轮到你"
        tasks={you}
        activeThreadId={activeThreadId}
        now={now}
        onOpen={(threadId) => {
          actions.open(threadId);
          onNavigate();
        }}
      />
      <TaskGroup
        label="在跑"
        tasks={running}
        activeThreadId={activeThreadId}
        now={now}
        onOpen={(threadId) => {
          actions.open(threadId);
          onNavigate();
        }}
      />
      <section aria-label="其它" className="mt-3">
        <button
          type="button"
          className="flex min-h-7 w-full items-center gap-1 rounded px-1.5 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-expanded={!otherCollapsed}
          onClick={toggleOther}
        >
          <span>其它</span>
          <span>{otherCollapsed ? `· ${other.length + unfiled.length}` : ""}</span>
          <span className="min-w-0 flex-1" />
          <span aria-hidden="true">{otherCollapsed ? "›" : "⌄"}</span>
        </button>
        {!otherCollapsed
          ? (
            <div className="space-y-1 pt-1">
              {other.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  activeThreadId={activeThreadId}
                  now={now}
                  onOpen={(threadId) => {
                    actions.open(threadId);
                    onNavigate();
                  }}
                />
              ))}
              {unfiled.map((thread) => (
                <UnfiledRow
                  key={thread.id}
                  thread={thread}
                  promoting={promotingThreadId === thread.id}
                  onOpen={() => {
                    actions.open(thread.id);
                    onNavigate();
                  }}
                  onPromote={() => void promote(thread)}
                />
              ))}
              {other.length === 0 && unfiled.length === 0
                ? <p className="px-1.5 py-2 text-xs text-muted-foreground">没有其它 task</p>
                : null}
            </div>
          )
          : null}
      </section>
      {error !== null ? <p role="status" className="px-1.5 pt-2 text-2xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ProjectFilters({
  projects,
  selected,
  onToggle,
}: {
  projects: readonly string[];
  selected: ReadonlySet<string>;
  onToggle: (project: string) => void;
}) {
  if (projects.length === 0) return null;
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 pt-1" aria-label="Project filters">
      {projects.map((project) => (
        <button
          key={project}
          type="button"
          aria-pressed={selected.has(project)}
          className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs ${selected.has(project) ? "border-sidebar-border text-sidebar-foreground" : "border-transparent text-muted-foreground"}`}
          onClick={() => onToggle(project)}
        >
          {project}
        </button>
      ))}
    </div>
  );
}

function TaskGroup({
  label,
  tasks,
  activeThreadId,
  now,
  onOpen,
}: {
  label: string;
  tasks: readonly OverviewTask[];
  activeThreadId: string | null;
  now: number;
  onOpen: (threadId: string) => void;
}) {
  return (
    <section aria-label={label} className="mt-2">
      <h2 className="px-1.5 py-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h2>
      <div className="space-y-1">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} activeThreadId={activeThreadId} now={now} onOpen={onOpen} />
        ))}
        {tasks.length === 0 ? <p className="px-1.5 py-1 text-xs text-muted-foreground">没有</p> : null}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  activeThreadId,
  now,
  onOpen,
}: {
  task: OverviewTask;
  activeThreadId: string | null;
  now: number;
  onOpen: (threadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stale = task.lastMovedAt !== null && now - task.lastMovedAt > THREE_DAYS_MS;
  return (
    <article className={stale ? "rounded px-1.5 py-1 text-muted-foreground" : "rounded px-1.5 py-1"}>
      <button
        type="button"
        className="flex min-h-8 w-full items-start gap-1 text-left hover:bg-sidebar-accent"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="pt-0.5 text-2xs text-muted-foreground">{expanded ? "⌄" : "›"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-sidebar-foreground">
            <span className="mr-1 font-mono text-2xs text-muted-foreground">{task.key}</span>
            {task.title}
          </span>
          <span className="block truncate text-2xs text-muted-foreground">{task.next?.slice(0, 40) ?? task.reason}</span>
        </span>
        <span className="shrink-0 pt-0.5 text-2xs tabular-nums text-muted-foreground">{relativeUpdatedAt(task.lastMovedAt, now)}</span>
      </button>
      {expanded
        ? (
          <div className="ml-4 mt-1 space-y-0.5">
            <ThreadTree threads={task.threads} parentThreadId={null} activeThreadId={activeThreadId} onOpen={onOpen} />
            {task.pullRequests.map((pullRequest) => (
              <a
                key={pullRequest.url}
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate px-1 text-2xs text-muted-foreground hover:text-sidebar-foreground hover:underline"
              >
                PR #{pullRequest.number} · {pullRequest.title}
              </a>
            ))}
          </div>
        )
        : null}
    </article>
  );
}

function ThreadTree({
  threads,
  parentThreadId,
  activeThreadId,
  onOpen,
}: {
  threads: readonly ThreadSummary[];
  parentThreadId: string | null;
  activeThreadId: string | null;
  onOpen: (threadId: string) => void;
}) {
  const children = threads
    .filter((thread) => thread.parentThreadId === parentThreadId || (parentThreadId === null && !threads.some((candidate) => candidate.id === thread.parentThreadId)))
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    <>
      {children.map((thread) => (
        <div key={thread.id}>
          <button
            type="button"
            className={`group flex w-full items-center gap-1 rounded px-1 py-1 text-left text-2xs hover:bg-sidebar-accent ${activeThreadId === thread.id ? "bg-sidebar-accent" : ""}`}
            onClick={() => onOpen(thread.id)}
          >
            <span className="w-3 shrink-0 text-center text-muted-foreground">{statusGlyph(thread.status)}</span>
            <span className="min-w-0 flex-1 truncate">{thread.title}</span>
            <span className="shrink-0 text-muted-foreground">{relativeUpdatedAt(thread.updatedAt)}</span>
          </button>
          <div className="ml-3 border-l border-sidebar-border pl-1">
            <ThreadTree threads={threads} parentThreadId={thread.id} activeThreadId={activeThreadId} onOpen={onOpen} />
          </div>
        </div>
      ))}
    </>
  );
}

function UnfiledRow({
  thread,
  promoting,
  onOpen,
  onPromote,
}: {
  thread: ThreadSummary;
  promoting: boolean;
  onOpen: () => void;
  onPromote: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent">
      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={onOpen}>{thread.title}</button>
      <button
        type="button"
        className="shrink-0 rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-sidebar-border hover:text-sidebar-foreground"
        disabled={promoting}
        onClick={onPromote}
      >
        {promoting ? "…" : "提升为 task"}
      </button>
    </div>
  );
}

function statusGlyph(status: ThreadSummary["status"]): string {
  switch (status) {
    case "error": return "!";
    case "pendingInteraction": return "?";
    case "running": return "·";
    case "idle": return "";
  }
}
