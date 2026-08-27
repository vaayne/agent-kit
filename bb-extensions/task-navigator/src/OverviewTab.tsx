import { useRpc, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { useMemo, useState } from "react";
import type { Overview, OverviewTask, taskNavigatorRpc } from "./server.js";
import { reasonText, type Strings } from "./strings.js";
import { errorText, primaryThread, projectKeyOf, relativeAge, useMinuteClock, useOpenThread, useStrings, useTaskOverview } from "./useTaskOverview.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60_000;

/**
 * Columns are derived attention states, never the manual status field, so a
 * card moves when facts change and nobody has to drag it.
 */
const COLUMNS: readonly (keyof Overview["groups"])[] = ["you", "running", "waiting", "stalled", "backlog", "done"];

export function OverviewTab({}: PluginNavPanelProps) {
  const { overview, error, loading, reload } = useTaskOverview();
  const t = useStrings();
  const now = useMinuteClock();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const projects = useMemo(() => {
    if (overview === null) return [];
    return [...new Set(Object.values(overview.groups).flat().map((task) => projectKeyOf(task.key)))].sort();
  }, [overview]);
  if (loading) return <p className="p-5 text-sm text-muted-foreground">{t.loading}</p>;
  if (overview === null) return <p className="p-5 text-sm text-destructive">{error ?? t.loadError}</p>;
  const filter = (task: OverviewTask) => projectFilter === null || projectKeyOf(task.key) === projectFilter;
  const cycleDays = medianCycleDays(overview.groups.done);
  const stale = overview.groups.stalled
    .filter(filter)
    .filter((task) => task.lastMovedAt !== null && now - task.lastMovedAt > THIRTY_DAYS_MS);
  return (
    <main className="flex h-full min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-base font-semibold">{t.board.title}</h1>
        <div className="flex gap-1 overflow-x-auto" aria-label="Project filters">
          <FilterChip active={projectFilter === null} onClick={() => setProjectFilter(null)}>{t.board.all}</FilterChip>
          {projects.map((project) => (
            <FilterChip key={project} active={projectFilter === project} onClick={() => setProjectFilter(project)}>{project}</FilterChip>
          ))}
        </div>
        <span className="min-w-0 flex-1" />
        <span className="text-xs text-muted-foreground">
          {t.board.doneThisWeek(overview.doneThisWeek)}{cycleDays === null ? "" : ` · ${t.board.cycle(cycleDays)}`}
        </span>
        <ArchiveStale t={t} tasks={stale} onArchived={reload} />
      </header>
      {error !== null ? <p role="status" className="text-xs text-destructive">{error}</p> : null}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column}
            t={t}
            label={t.board.columns[column][0]}
            hint={t.board.columns[column][1]}
            tasks={overview.groups[column].filter(filter)}
            now={now}
            muted={column === "done" || column === "backlog"}
          />
        ))}
      </div>
    </main>
  );
}

/** Created to done, over the recently finished tasks that carry both timestamps. */
function medianCycleDays(done: readonly OverviewTask[]): number | null {
  const spans = done
    .flatMap((task) => task.createdAt !== null && task.doneAt !== null ? [task.doneAt - task.createdAt] : [])
    .sort((left, right) => left - right);
  if (spans.length === 0) return null;
  const middle = spans[Math.floor(spans.length / 2)]!;
  return Math.max(1, Math.round(middle / (24 * 60 * 60_000)));
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
  t,
  label,
  hint,
  tasks,
  now,
  muted,
}: {
  t: Strings;
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
        {tasks.map((task) => <BoardCard key={task.id} t={t} task={task} now={now} />)}
        {tasks.length === 0 ? <p className="px-1 py-2 text-xs text-muted-foreground">{t.board.none}</p> : null}
      </div>
    </section>
  );
}

function BoardCard({ t, task, now }: { t: Strings; task: OverviewTask; now: number }) {
  const openThread = useOpenThread();
  const thread = primaryThread(task.threads);
  const openPullRequest = task.pullRequests.find((pullRequest) => pullRequest.state === "open" || pullRequest.state === "draft");
  return (
    <article className="rounded-md border border-border bg-card p-2 text-sm shadow-sm">
      <button
        type="button"
        className="block w-full text-left hover:underline disabled:no-underline"
        disabled={thread === undefined}
        title={thread === undefined ? t.noThread : thread.title}
        onClick={() => {
          if (thread !== undefined) openThread(thread);
        }}
      >
        <span className="font-mono text-2xs text-muted-foreground">{task.key}</span>
        <span className="mt-0.5 line-clamp-2 block leading-snug">{task.title}</span>
      </button>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.next ?? reasonText(t, task.reason, task.reasonPr)}</p>
      <div className="mt-1 flex items-center gap-2 text-2xs text-muted-foreground">
        <span className="tabular-nums">{relativeAge(task.lastMovedAt, now)}</span>
        {task.threads.length > 0 ? <span>{t.board.threads(task.threads.length)}</span> : null}
        {task.doneAt !== null && task.createdAt !== null
          ? <span>{t.board.took(Math.max(1, Math.round((task.doneAt - task.createdAt) / 86_400_000)))}</span>
          : null}
        <span className="min-w-0 flex-1" />
        {openPullRequest !== undefined
          ? <a href={openPullRequest.url} target="_blank" rel="noreferrer" className="hover:underline">PR #{openPullRequest.number}</a>
          : null}
      </div>
    </article>
  );
}

function ArchiveStale({
  t,
  tasks,
  onArchived,
}: {
  t: Strings;
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
        setError(t.board.archivedPartial(archivedTaskIds.length, tasks.length));
      }
      setConfirming(false);
      await onArchived();
    } catch (cause) {
      setError(errorText(cause, t.board.archiveError));
    } finally {
      setSaving(false);
    }
  };
  if (tasks.length === 0 && error === null) {
    return <button type="button" disabled className="rounded border border-input px-2 py-1 text-xs opacity-50">{t.board.archiveStale}</button>;
  }
  if (confirming) {
    return (
      <div className="space-y-2 rounded border border-border p-2 text-xs">
        <p>{t.board.willArchive(tasks.length)}</p>
        <p className="max-w-56 text-muted-foreground">{tasks.map((task) => task.key).join("、")}</p>
        {error !== null ? <p role="alert" className="text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-1">
          <button type="button" disabled={saving} className="rounded px-2 py-1" onClick={() => setConfirming(false)}>{t.board.cancel}</button>
          <button type="button" disabled={saving} className="rounded bg-destructive/15 px-2 py-1 text-destructive" onClick={() => void archive()}>{saving ? t.board.archiving : t.board.confirmArchive}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {error !== null ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
      <button type="button" disabled={tasks.length === 0} className="rounded border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50" onClick={() => setConfirming(true)}>{t.board.archiveStale}</button>
    </div>
  );
}
