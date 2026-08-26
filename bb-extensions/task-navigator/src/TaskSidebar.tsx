import { useRpc, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { useCallback, useMemo, useState } from "react";
import type { OverviewTask, ThreadSummary, taskNavigatorRpc } from "./server.js";
import { UsageFooter } from "./UsageFooter.js";
import { errorText, projectKeyOf, relativeAge, useMinuteClock, useOpenThread, useTaskOverview } from "./useTaskOverview.js";

// Stored as the projects to hide, so a project created tomorrow shows up without touching the chips.
const HIDDEN_PROJECTS_STORAGE_KEY = "bb-plugin-task-navigator:hidden-projects";
const COLLAPSED_STORAGE_KEY = "bb-plugin-task-navigator:collapsed";
const THREE_DAYS_MS = 3 * 24 * 60 * 60_000;

type CollapsibleSection = "other" | "done";

function readStringSet(key: string): Set<string> {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return new Set();
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? new Set(parsed)
      : new Set();
  } catch {
    return new Set();
  }
}

function saveStringSet(key: string, values: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Sidebar preferences are an enhancement only.
  }
}

function readCollapsed(): Set<CollapsibleSection> {
  const stored = readStringSet(COLLAPSED_STORAGE_KEY);
  // Both fold by default; the sidebar opens on what needs you, not on history.
  if (stored.size === 0 && window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === null) {
    return new Set(["other", "done"]);
  }
  return new Set([...stored].filter((item): item is CollapsibleSection => item === "other" || item === "done"));
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
  const openThread = useOpenThread();
  const { overview, error, reload } = useTaskOverview();
  const [actionError, setActionError] = useState<string | null>(null);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(() => readStringSet(HIDDEN_PROJECTS_STORAGE_KEY));
  const [collapsed, setCollapsed] = useState<Set<CollapsibleSection>>(readCollapsed);
  const [promotingThreadId, setPromotingThreadId] = useState<string | null>(null);
  const now = useMinuteClock();

  const projects = useMemo(() => {
    if (overview === null) return [];
    const keys = Object.values(overview.groups).flat().map((task) => projectKeyOf(task.key));
    return [...new Set(keys)].sort((left, right) => left.localeCompare(right));
  }, [overview]);
  const filterTask = useCallback((task: OverviewTask) =>
    !hiddenProjects.has(projectKeyOf(task.key)) && taskMatches(task, searchQuery),
  [searchQuery, hiddenProjects]);
  const you = overview?.groups.you.filter(filterTask) ?? [];
  const running = overview?.groups.running.filter(filterTask) ?? [];
  const other = [
    ...(overview?.groups.stalled ?? []),
    ...(overview?.groups.waiting ?? []),
    ...(overview?.groups.backlog ?? []),
  ].filter(filterTask);
  const done = overview?.groups.done.filter(filterTask) ?? [];
  const unfiled = (overview?.unfiled ?? []).filter((thread) => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    return !needle || thread.title.toLocaleLowerCase().includes(needle);
  });

  const toggleProject = (project: string) => {
    const next = new Set(hiddenProjects);
    if (next.has(project)) next.delete(project);
    else next.add(project);
    setHiddenProjects(next);
    saveStringSet(HIDDEN_PROJECTS_STORAGE_KEY, next);
  };
  const toggleSection = (section: CollapsibleSection) => {
    const next = new Set(collapsed);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setCollapsed(next);
    saveStringSet(COLLAPSED_STORAGE_KEY, next);
  };
  const open = (thread: ThreadSummary) => {
    openThread(thread);
    onNavigate();
  };
  const promote = async (thread: ThreadSummary) => {
    setPromotingThreadId(thread.id);
    setActionError(null);
    try {
      await rpc.call("promoteThread", { threadId: thread.id });
      open(thread);
      await reload();
    } catch (cause) {
      setActionError(errorText(cause, "Could not promote thread."));
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <ProjectFilters projects={projects} hidden={hiddenProjects} onToggle={toggleProject} />
        <TaskGroup label="轮到你" tasks={you} activeThreadId={activeThreadId} now={now} onOpen={open} />
        <TaskGroup label="在跑" tasks={running} activeThreadId={activeThreadId} now={now} onOpen={open} />
        <FoldedSection
          label="其它"
          count={other.length + unfiled.length}
          collapsed={collapsed.has("other")}
          onToggle={() => toggleSection("other")}
        >
          {other.map((task) => (
            <TaskRow key={task.id} task={task} activeThreadId={activeThreadId} now={now} onOpen={open} />
          ))}
          {unfiled.map((thread) => (
            <UnfiledRow
              key={thread.id}
              thread={thread}
              promoting={promotingThreadId === thread.id}
              onOpen={() => open(thread)}
              onPromote={() => void promote(thread)}
            />
          ))}
          {other.length === 0 && unfiled.length === 0
            ? <p className="px-1.5 py-2 text-xs text-muted-foreground">没有其它 task</p>
            : null}
        </FoldedSection>
        {done.length > 0
          ? (
            <FoldedSection
              label="最近完成"
              count={done.length}
              collapsed={collapsed.has("done")}
              onToggle={() => toggleSection("done")}
            >
              {done.map((task) => (
                <TaskRow key={task.id} task={task} activeThreadId={activeThreadId} now={now} onOpen={open} />
              ))}
            </FoldedSection>
          )
          : null}
        {(actionError ?? error) !== null
          ? <p role="status" className="px-1.5 pt-2 text-2xs text-destructive">{actionError ?? error}</p>
          : null}
      </div>
      <UsageFooter />
    </div>
  );
}

function ProjectFilters({
  projects,
  hidden,
  onToggle,
}: {
  projects: readonly string[];
  hidden: ReadonlySet<string>;
  onToggle: (project: string) => void;
}) {
  if (projects.length < 2) return null;
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 pt-1" aria-label="Project filters">
      {projects.map((project) => {
        const selected = !hidden.has(project);
        return (
          <button
            key={project}
            type="button"
            aria-pressed={selected}
            className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs ${selected ? "border-sidebar-border text-sidebar-foreground" : "border-transparent text-muted-foreground"}`}
            onClick={() => onToggle(project)}
          >
            {project}
          </button>
        );
      })}
    </div>
  );
}

function FoldedSection({
  label,
  count,
  collapsed,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={label} className="mt-3">
      <button
        type="button"
        className="flex min-h-7 w-full items-center gap-1 rounded px-1.5 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span>{collapsed ? `· ${count}` : ""}</span>
        <span className="min-w-0 flex-1" />
        <span aria-hidden="true">{collapsed ? "›" : "⌄"}</span>
      </button>
      {!collapsed ? <div className="space-y-1 pt-1">{children}</div> : null}
    </section>
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
  onOpen: (thread: ThreadSummary) => void;
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
  onOpen: (thread: ThreadSummary) => void;
}) {
  const containsActive = activeThreadId !== null && task.threads.some((thread) => thread.id === activeThreadId);
  const [expanded, setExpanded] = useState(containsActive);
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
        <span className="shrink-0 pt-0.5 text-2xs tabular-nums text-muted-foreground">{relativeAge(task.lastMovedAt, now)}</span>
      </button>
      {expanded
        ? (
          <div className="ml-4 mt-1 space-y-0.5">
            <ThreadTree threads={task.threads} parentThreadId={null} activeThreadId={activeThreadId} now={now} onOpen={onOpen} />
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
  now,
  onOpen,
}: {
  threads: readonly ThreadSummary[];
  parentThreadId: string | null;
  activeThreadId: string | null;
  now: number;
  onOpen: (thread: ThreadSummary) => void;
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
            onClick={() => onOpen(thread)}
          >
            <span className="w-3 shrink-0 text-center text-muted-foreground">{statusGlyph(thread.status)}</span>
            <span className={`min-w-0 flex-1 truncate ${thread.archived ? "text-muted-foreground" : ""}`}>{thread.title}</span>
            <span className="shrink-0 text-muted-foreground">{relativeAge(thread.updatedAt, now)}</span>
          </button>
          <div className="ml-3 border-l border-sidebar-border pl-1">
            <ThreadTree threads={threads} parentThreadId={thread.id} activeThreadId={activeThreadId} now={now} onOpen={onOpen} />
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
