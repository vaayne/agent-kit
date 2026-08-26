import {
  useRpc,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { useMemo, useState } from "react";
import type { OverviewTask, taskNavigatorRpc } from "./server.js";
import { useTaskOverview } from "./useTaskOverview.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

export function OverviewTab({}: PluginNavPanelProps) {
  const { overview, error, loading, reload } = useTaskOverview();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const projects = useMemo(() => {
    if (overview === null) return [];
    return [...new Set([
      ...overview.groups.you,
      ...overview.groups.running,
      ...overview.groups.stalled,
      ...overview.groups.waiting,
    ].map((task) => task.key.split("-", 1)[0] ?? task.key))].sort();
  }, [overview]);
  if (loading) return <p className="p-5 text-sm text-muted-foreground">Loading tasks…</p>;
  if (overview === null) return <p className="p-5 text-sm text-destructive">{error ?? "Could not load tasks."}</p>;
  const filter = (task: OverviewTask) => projectFilter === null || task.key.startsWith(`${projectFilter}-`);
  const stalled = overview.groups.stalled.filter(filter);
  const stale = stalled.filter((task) => task.lastMovedAt !== null && Date.now() - task.lastMovedAt > THIRTY_DAYS_MS);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">全景</p>
          <h1 className="mt-1 text-xl font-semibold">所有未完成 task</h1>
        </div>
        <ArchiveStale tasks={stale} onArchived={reload} />
      </header>
      <div className="flex gap-1 overflow-x-auto" aria-label="Project filters">
        <button
          type="button"
          aria-pressed={projectFilter === null}
          className="shrink-0 rounded-full border border-input px-2 py-0.5 text-xs"
          onClick={() => setProjectFilter(null)}
        >
          全部
        </button>
        {projects.map((project) => (
          <button
            key={project}
            type="button"
            aria-pressed={projectFilter === project}
            className="shrink-0 rounded-full border border-transparent px-2 py-0.5 text-xs text-muted-foreground aria-pressed:border-input aria-pressed:text-foreground"
            onClick={() => setProjectFilter(project)}
          >
            {project}
          </button>
        ))}
      </div>
      <OverviewGroup label="等你" tasks={overview.groups.you.filter(filter)} />
      <OverviewGroup label="在跑" tasks={overview.groups.running.filter(filter)} />
      <OverviewGroup label="停了没 next" tasks={stalled} />
      <OverviewGroup label="等 CI / 等别人" tasks={overview.groups.waiting.filter(filter)} />
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">本周完成 {overview.doneThisWeek} 件</summary>
      </details>
    </main>
  );
}

function OverviewGroup({ label, tasks }: { label: string; tasks: readonly OverviewTask[] }) {
  const actions = useSidebarThreadActions();
  return (
    <section>
      <h2 className="mb-1 text-sm font-medium">{label}</h2>
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">没有</p> : null}
      <div className="divide-y divide-border rounded border border-border">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
            onClick={() => {
              const thread = task.threads[0];
              if (thread !== undefined) actions.open(thread.id);
            }}
          >
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{task.key}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
            <span className="max-w-48 truncate text-xs text-muted-foreground">{task.next ?? task.reason}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{relativeUpdatedAt(task.lastMovedAt)}</span>
          </button>
        ))}
      </div>
    </section>
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
  const archive = async () => {
    setSaving(true);
    try {
      await rpc.call("archiveStale", { taskIds: tasks.map((task) => task.id) });
      setConfirming(false);
      await onArchived();
    } finally {
      setSaving(false);
    }
  };
  if (tasks.length === 0) {
    return <button type="button" disabled className="rounded border border-input px-2 py-1 text-xs opacity-50">归档 30 天没动的</button>;
  }
  if (confirming) {
    return (
      <div className="space-y-2 rounded border border-border p-2 text-xs">
        <p>将归档 {tasks.length} 件：</p>
        <p className="max-w-56 text-muted-foreground">{tasks.map((task) => task.key).join("、")}</p>
        <div className="flex justify-end gap-1">
          <button type="button" disabled={saving} className="rounded px-2 py-1" onClick={() => setConfirming(false)}>取消</button>
          <button type="button" disabled={saving} className="rounded bg-destructive/15 px-2 py-1 text-destructive" onClick={() => void archive()}>{saving ? "归档中…" : "确认归档"}</button>
        </div>
      </div>
    );
  }
  return <button type="button" className="rounded border border-input px-2 py-1 text-xs hover:bg-accent" onClick={() => setConfirming(true)}>归档 30 天没动的</button>;
}

function relativeUpdatedAt(timestamp: number | null): string {
  if (timestamp === null) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
