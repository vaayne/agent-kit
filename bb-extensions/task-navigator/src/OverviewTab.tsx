import { useRpc, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { useMemo, useState } from "react";
import type { Overview, OverviewTask, taskNavigatorRpc } from "./server.js";
import { errorText, primaryThread, projectKeyOf, relativeAge, useMinuteClock, useOpenThread, useTaskOverview } from "./useTaskOverview.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

/**
 * Columns are derived attention states, never the manual status field, so a
 * card moves when facts change and nobody has to drag it.
 */
const COLUMNS: readonly { key: keyof Overview["groups"]; label: string; hint: string }[] = [
  { key: "you", label: "等你", hint: "agent 在问、PR 等 review" },
  { key: "running", label: "在跑", hint: "agent 正在工作" },
  { key: "waiting", label: "等 CI / 等别人", hint: "有 next，不用你动" },
  { key: "stalled", label: "停了", hint: "没有 next，写一条或关掉" },
  { key: "backlog", label: "未开始", hint: "还没有线程" },
  { key: "done", label: "最近完成", hint: "30 天内结束" },
];

export function OverviewTab({}: PluginNavPanelProps) {
  const { overview, error, loading, reload } = useTaskOverview();
  const now = useMinuteClock();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const projects = useMemo(() => {
    if (overview === null) return [];
    return [...new Set(Object.values(overview.groups).flat().map((task) => projectKeyOf(task.key)))].sort();
  }, [overview]);
  if (loading) return <p className="p-5 text-sm text-muted-foreground">Loading tasks…</p>;
  if (overview === null) return <p className="p-5 text-sm text-destructive">{error ?? "Could not load tasks."}</p>;
  const filter = (task: OverviewTask) => projectFilter === null || projectKeyOf(task.key) === projectFilter;
  const stale = overview.groups.stalled
    .filter(filter)
    .filter((task) => task.lastMovedAt !== null && now - task.lastMovedAt > THIRTY_DAYS_MS);
  return (
    <main className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">全景</h1>
        <div className="flex gap-1 overflow-x-auto" aria-label="Project filters">
          <FilterChip active={projectFilter === null} onClick={() => setProjectFilter(null)}>全部</FilterChip>
          {projects.map((project) => (
            <FilterChip key={project} active={projectFilter === project} onClick={() => setProjectFilter(project)}>{project}</FilterChip>
          ))}
        </div>
        <span className="min-w-0 flex-1" />
        <span className="text-xs text-muted-foreground">本周完成 {overview.doneThisWeek} 件</span>
        <ArchiveStale tasks={stale} onArchived={reload} />
      </header>
      {error !== null ? <p role="status" className="text-xs text-destructive">{error}</p> : null}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.key}
            label={column.label}
            hint={column.hint}
            tasks={overview.groups[column.key].filter(filter)}
            now={now}
            muted={column.key === "done" || column.key === "backlog"}
          />
        ))}
      </div>
    </main>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${active ? "border-input text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BoardColumn({
  label,
  hint,
  tasks,
  now,
  muted,
}: {
  label: string;
  hint: string;
  tasks: readonly OverviewTask[];
  now: number;
  muted: boolean;
}) {
  return (
    <section aria-label={label} className={`flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/30 ${muted ? "opacity-80" : ""}`}>
      <header className="px-3 pb-1 pt-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-medium">{label}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        </div>
        <p className="text-2xs text-muted-foreground">{hint}</p>
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {tasks.map((task) => <BoardCard key={task.id} task={task} now={now} />)}
        {tasks.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">没有</p> : null}
      </div>
    </section>
  );
}

function BoardCard({ task, now }: { task: OverviewTask; now: number }) {
  const openThread = useOpenThread();
  const thread = primaryThread(task.threads);
  const openPullRequest = task.pullRequests.find((pullRequest) => pullRequest.state === "open" || pullRequest.state === "draft");
  return (
    <article className="rounded-md border border-border bg-card p-2 text-sm shadow-sm">
      <button
        type="button"
        className="block w-full text-left hover:underline disabled:no-underline"
        disabled={thread === undefined}
        title={thread === undefined ? "还没有线程" : `打开 ${thread.title}`}
        onClick={() => {
          if (thread !== undefined) openThread(thread);
        }}
      >
        <span className="font-mono text-2xs text-muted-foreground">{task.key}</span>
        <span className="mt-0.5 line-clamp-2 block leading-snug">{task.title}</span>
      </button>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.next ?? task.reason}</p>
      <div className="mt-1 flex items-center gap-2 text-2xs text-muted-foreground">
        <span className="tabular-nums">{relativeAge(task.lastMovedAt, now)}</span>
        {task.threads.length > 0 ? <span>{task.threads.length} 线程</span> : null}
        <span className="min-w-0 flex-1" />
        {openPullRequest !== undefined
          ? <a href={openPullRequest.url} target="_blank" rel="noreferrer" className="hover:underline">PR #{openPullRequest.number}</a>
          : null}
      </div>
    </article>
  );
}

function ArchiveStale({
  tasks,
  onArchived,
}: {
  tasks: readonly OverviewTask[];
  onArchived: () => Promise<void>;
}) {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archive = async () => {
    setSaving(true);
    setError(null);
    try {
      const { archivedTaskIds } = await rpc.call("archiveStale", { taskIds: tasks.map((task) => task.id) });
      if (archivedTaskIds.length < tasks.length) {
        setError(`只归档了 ${archivedTaskIds.length} / ${tasks.length} 件，其余已重新活跃或更新失败`);
      }
      setConfirming(false);
      await onArchived();
    } catch (cause) {
      setError(errorText(cause, "归档失败"));
    } finally {
      setSaving(false);
    }
  };
  if (tasks.length === 0 && error === null) {
    return <button type="button" disabled className="rounded border border-input px-2 py-1 text-xs opacity-50">归档 30 天没动的</button>;
  }
  if (confirming) {
    return (
      <div className="space-y-2 rounded border border-border p-2 text-xs">
        <p>将归档 {tasks.length} 件：</p>
        <p className="max-w-56 text-muted-foreground">{tasks.map((task) => task.key).join("、")}</p>
        {error !== null ? <p role="alert" className="text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-1">
          <button type="button" disabled={saving} className="rounded px-2 py-1" onClick={() => setConfirming(false)}>取消</button>
          <button type="button" disabled={saving} className="rounded bg-destructive/15 px-2 py-1 text-destructive" onClick={() => void archive()}>{saving ? "归档中…" : "确认归档"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {error !== null ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
      <button type="button" disabled={tasks.length === 0} className="rounded border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50" onClick={() => setConfirming(true)}>归档 30 天没动的</button>
    </div>
  );
}
