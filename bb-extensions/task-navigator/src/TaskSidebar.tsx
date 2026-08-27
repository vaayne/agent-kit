import { useRpc, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import type { OverviewTask, ThreadSummary, taskNavigatorRpc } from "./server.js";
import { reasonText, type Strings } from "./strings.js";
import { UsageFooter } from "./UsageFooter.js";
import { errorText, relativeAge, useMinuteClock, useOpenThread, useStrings, useTaskOverview } from "./useTaskOverview.js";

/*
 * The sidebar answers one question: where do I click next. Three layers:
 * the PMO row, Now (tasks needing you or running, plus the task you are in),
 * Scratch (one-off threads, newest first). Everything else folds into More
 * with no counts, because a count never points at an action.
 */

const MORE_STORAGE_KEY = "bb-plugin-task-navigator:more-open";
const SCRATCH_PREVIEW = 6;

function readMoreOpen(): boolean {
  try {
    return window.localStorage.getItem(MORE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function matches(text: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || text.toLocaleLowerCase().includes(needle);
}

function taskText(task: OverviewTask): string {
  return [task.key, task.title, task.next ?? "", ...task.threads.map((thread) => thread.title)].join(" ");
}

export function TaskSidebar({ activeThreadId, onNavigate, searchQuery }: PluginThreadListProps) {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const openThread = useOpenThread();
  const t = useStrings();
  const { overview, error, reload } = useTaskOverview();
  const now = useMinuteClock();
  const [moreOpen, setMoreOpen] = useState(readMoreOpen);
  const [scratchAll, setScratchAll] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (overview === null) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">{error ?? t.loading}</p>;
  }

  const filterTask = (task: OverviewTask) => matches(taskText(task), searchQuery);
  const { groups } = overview;
  // The task you are inside is always visible, whatever state it derived to.
  const current = activeThreadId === null
    ? undefined
    : Object.values(groups).flat().find((task) => task.threads.some((thread) => thread.id === activeThreadId));
  const nowTasks = [...groups.you, ...groups.running];
  if (current !== undefined && !nowTasks.some((task) => task.id === current.id)) nowTasks.push(current);
  const nowList = nowTasks.filter(filterTask);
  const searching = searchQuery.trim() !== "";
  const scratch = overview.unfiled.filter((thread) => matches(thread.title, searchQuery));
  const scratchShown = scratchAll || searching ? scratch : scratch.slice(0, SCRATCH_PREVIEW);
  const moreGroups: { key: string; label: string; tasks: OverviewTask[] }[] = [
    { key: "waiting", label: t.waiting, tasks: groups.waiting.filter(filterTask) },
    { key: "stalled", label: t.stalled, tasks: groups.stalled.filter(filterTask) },
    { key: "backlog", label: t.backlog, tasks: groups.backlog.filter(filterTask) },
    { key: "done", label: t.done, tasks: groups.done.filter(filterTask) },
  ].filter((group) => group.tasks.length > 0);
  const moreVisible = moreOpen || searching;

  const open = (thread: ThreadSummary) => {
    openThread(thread);
    onNavigate();
  };
  const toggleMore = () => {
    const next = !moreOpen;
    setMoreOpen(next);
    try {
      window.localStorage.setItem(MORE_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Preference only.
    }
  };
  const promote = async (thread: ThreadSummary) => {
    setPromotingId(thread.id);
    setActionError(null);
    try {
      await rpc.call("promoteThread", { threadId: thread.id });
      await reload();
    } catch (cause) {
      setActionError(errorText(cause, t.promoteError));
    } finally {
      setPromotingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {overview.pmo !== null
          ? <PmoRow t={t} thread={overview.pmo} active={activeThreadId === overview.pmo.id} now={now} onOpen={() => open(overview.pmo!)} />
          : null}

        {nowList.length > 0
          ? (
            <Section label={t.now}>
              {nowList.map((task) => (
                <TaskRow key={task.id} t={t} task={task} activeThreadId={activeThreadId} now={now} onOpen={open} />
              ))}
            </Section>
          )
          : null}

        <Section label={t.scratch}>
          {scratchShown.map((thread) => (
            <ScratchRow
              key={thread.id}
              t={t}
              thread={thread}
              active={activeThreadId === thread.id}
              now={now}
              promoting={promotingId === thread.id}
              onOpen={() => open(thread)}
              onPromote={() => void promote(thread)}
            />
          ))}
          {scratch.length === 0 ? <p className="px-1.5 py-1 text-2xs text-muted-foreground">{t.scratchEmpty}</p> : null}
          {!searching && scratch.length > SCRATCH_PREVIEW
            ? (
              <button type="button" className="px-1.5 py-1 text-2xs text-muted-foreground hover:text-sidebar-foreground" onClick={() => setScratchAll((value) => !value)}>
                {scratchAll ? t.showLess : t.showAll(scratch.length)}
              </button>
            )
            : null}
        </Section>

        {moreGroups.length > 0
          ? (
            <section aria-label={t.more} className="mt-2">
              <button
                type="button"
                className="flex min-h-6 w-full items-center gap-1 rounded px-1.5 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-expanded={moreVisible}
                onClick={toggleMore}
              >
                <Chevron open={moreVisible} />
                <span>{t.more}</span>
              </button>
              {moreVisible
                ? moreGroups.map((group) => (
                  <div key={group.key} className="mt-1">
                    <p className="px-1.5 py-0.5 text-2xs text-muted-foreground">{group.label}</p>
                    {group.tasks.map((task) => (
                      <TaskRow key={task.id} t={t} task={task} activeThreadId={activeThreadId} now={now} onOpen={open} muted />
                    ))}
                  </div>
                ))
                : null}
            </section>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="mt-2">
      <h2 className="px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h2>
      <div className="space-y-px">{children}</div>
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** A 6px dot: filled when running, ring when asking, destructive when errored, none when idle. */
function StatusDot({ status }: { status: ThreadSummary["status"] }) {
  if (status === "idle") return <span className="size-1.5 shrink-0" />;
  const tone = status === "running" ? "bg-sidebar-foreground" : status === "error" ? "bg-destructive" : "border border-sidebar-foreground";
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone}`} />;
}

function PmoRow({ t, thread, active, now, onOpen }: { t: Strings; thread: ThreadSummary; active: boolean; now: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label={t.pmo}
      className={`mt-1 flex min-h-7 w-full items-center gap-1.5 rounded border border-dashed border-sidebar-border px-1.5 text-left text-xs hover:bg-sidebar-accent ${active ? "bg-sidebar-accent" : ""}`}
      onClick={onOpen}
    >
      <StatusDot status={thread.status} />
      <span className="font-medium text-sidebar-foreground">{t.pmo}</span>
      <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{t.pmoHint[thread.status]}</span>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{relativeAge(thread.updatedAt, now)}</span>
    </button>
  );
}

function taskStatus(task: OverviewTask): ThreadSummary["status"] {
  const live = task.threads.filter((thread) => !thread.archived);
  if (live.some((thread) => thread.status === "pendingInteraction")) return "pendingInteraction";
  if (live.some((thread) => thread.status === "error")) return "error";
  if (live.some((thread) => thread.status === "running")) return "running";
  return "idle";
}

function TaskRow({ t, task, activeThreadId, now, onOpen, muted = false }: {
  t: Strings;
  task: OverviewTask;
  activeThreadId: string | null;
  now: number;
  onOpen: (thread: ThreadSummary) => void;
  muted?: boolean;
}) {
  const containsActive = activeThreadId !== null && task.threads.some((thread) => thread.id === activeThreadId);
  const [expanded, setExpanded] = useState(containsActive);
  return (
    <article className={muted ? "text-muted-foreground" : ""}>
      <button
        type="button"
        className={`flex min-h-7 w-full items-center gap-1.5 rounded px-1.5 text-left hover:bg-sidebar-accent ${containsActive && !expanded ? "bg-sidebar-accent/60" : ""}`}
        aria-expanded={expanded}
        title={task.title}
        onClick={() => setExpanded((value) => !value)}
      >
        <StatusDot status={taskStatus(task)} />
        <span className="min-w-0 flex-1 truncate text-xs">
          <span className="mr-1 font-mono text-2xs text-muted-foreground">{task.key}</span>
          <span className={muted ? "" : "text-sidebar-foreground"}>{task.title}</span>
        </span>
        <span className="max-w-24 shrink-0 truncate text-2xs text-muted-foreground">{reasonText(t, task.reason, task.reasonPr)}</span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{relativeAge(task.lastMovedAt, now)}</span>
      </button>
      {expanded
        ? (
          <div className="ml-3 border-l border-sidebar-border pl-1.5">
            <ThreadTree t={t} threads={task.threads} parentThreadId={null} activeThreadId={activeThreadId} now={now} onOpen={onOpen} />
            {task.pullRequests.map((pullRequest) => (
              <a key={pullRequest.url} href={pullRequest.url} target="_blank" rel="noreferrer" className="block truncate px-1 py-0.5 text-2xs text-muted-foreground hover:text-sidebar-foreground hover:underline">
                PR #{pullRequest.number} · {pullRequest.title}
              </a>
            ))}
          </div>
        )
        : null}
    </article>
  );
}

function ThreadTree({ t, threads, parentThreadId, activeThreadId, now, onOpen }: {
  t: Strings;
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
            className={`flex min-h-6 w-full items-center gap-1.5 rounded px-1 text-left text-2xs hover:bg-sidebar-accent ${activeThreadId === thread.id ? "bg-sidebar-accent" : ""}`}
            title={thread.archived ? `${thread.title} · ${t.archived}` : thread.title}
            onClick={() => onOpen(thread)}
          >
            <StatusDot status={thread.status} />
            <span className={`min-w-0 flex-1 truncate ${thread.archived ? "text-muted-foreground" : "text-sidebar-foreground"}`}>{thread.title}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{relativeAge(thread.updatedAt, now)}</span>
          </button>
          <div className="ml-2 border-l border-sidebar-border pl-1">
            <ThreadTree t={t} threads={threads} parentThreadId={thread.id} activeThreadId={activeThreadId} now={now} onOpen={onOpen} />
          </div>
        </div>
      ))}
    </>
  );
}

function ScratchRow({ t, thread, active, now, promoting, onOpen, onPromote }: {
  t: Strings;
  thread: ThreadSummary;
  active: boolean;
  now: number;
  promoting: boolean;
  onOpen: () => void;
  onPromote: () => void;
}) {
  return (
    <div className={`group flex min-h-7 items-center gap-1.5 rounded px-1.5 text-xs hover:bg-sidebar-accent ${active ? "bg-sidebar-accent" : ""}`}>
      <StatusDot status={thread.status} />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sidebar-foreground" title={thread.title} onClick={onOpen}>{thread.title}</button>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground group-hover:hidden">{relativeAge(thread.updatedAt, now)}</span>
      <button
        type="button"
        className="hidden shrink-0 rounded px-1 text-2xs text-muted-foreground hover:text-sidebar-foreground group-hover:block"
        disabled={promoting}
        onClick={onPromote}
      >
        {promoting ? t.promoting : t.promote}
      </button>
    </div>
  );
}
