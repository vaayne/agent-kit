import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginThreadListProps,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import { type TaskAttentionItem, threadSummaryFromLive } from "./attention.js";
import type { OverviewTask, taskNavigatorRpc, ThreadSummary } from "./server.js";
import { attentionOf, StatusIcon } from "./StatusIcon.js";
import { reasonText, type Strings } from "./strings.js";
import { UsageFooter } from "./UsageFooter.js";
import { useOpenAttentionThread, useTaskAttention } from "./useTaskAttention.js";
import { errorText, relativeAge, useMinuteClock, useStrings, useTaskOverview } from "./useTaskOverview.js";

/*
 * Pinned is stable access, Now is attention, Scratch is unfiled work, and More
 * is the workflow directory. A task appears in only one sidebar layer.
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
  const threadActions = useSidebarThreadActions();
  const { threads: liveThreads } = useSidebarThreads();
  const openAttentionThread = useOpenAttentionThread();
  const t = useStrings();
  const { overview, error, reload } = useTaskOverview();
  const now = useMinuteClock();
  const [moreOpen, setMoreOpen] = useState(readMoreOpen);
  const [scratchAll, setScratchAll] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const attention = useTaskAttention(overview, activeThreadId);

  if (overview === null) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">{error ?? t.loading}</p>;
  }

  const filterTask = (task: OverviewTask) => matches(taskText(task), searchQuery);
  const { groups } = overview;
  const pinnedItems = attention.pinned.filter((item) => filterTask(item.task));
  const pinnedTaskIds = new Set(attention.pinned.map((item) => item.task.id));
  const pinnedThreadIds = new Set(liveThreads.filter((thread) => thread.isPinned).map((thread) => thread.id));
  const nowList = attention.now.filter((item) => filterTask(item.task));
  const searching = searchQuery.trim() !== "";
  const loosePinned = liveThreads
    .filter((thread) =>
      thread.isPinned
      && !thread.isArchived
      && overview.filed[thread.id] === undefined
      && thread.id !== overview.pmo?.id
    )
    .map(threadSummaryFromLive)
    .filter((thread) => matches(thread.title, searchQuery))
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const scratch = overview.unfiled.filter((thread) =>
    !pinnedThreadIds.has(thread.id) && matches(thread.title, searchQuery)
  );
  const scratchShown = scratchAll || searching ? scratch : scratch.slice(0, SCRATCH_PREVIEW);
  const moreGroups: { key: string; label: string; tasks: OverviewTask[] }[] = [
    {
      key: "waiting",
      label: t.waiting,
      tasks: groups.waiting.filter((task) => !pinnedTaskIds.has(task.id) && filterTask(task)),
    },
    {
      key: "stalled",
      label: t.stalled,
      tasks: groups.stalled.filter((task) => !pinnedTaskIds.has(task.id) && filterTask(task)),
    },
    {
      key: "backlog",
      label: t.backlog,
      tasks: groups.backlog.filter((task) => !pinnedTaskIds.has(task.id) && filterTask(task)),
    },
    {
      key: "done",
      label: t.done,
      tasks: groups.done.filter((task) => !pinnedTaskIds.has(task.id) && filterTask(task)),
    },
  ].filter((group) => group.tasks.length > 0);
  const moreVisible = moreOpen || searching;

  const open = (thread: ThreadSummary) => {
    openAttentionThread(thread);
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
  const setThreadPinned = async (threadId: string, pinned: boolean) => {
    setPinningId(threadId);
    setActionError(null);
    try {
      await threadActions.setPinned(threadId, pinned);
    } catch (cause) {
      setActionError(errorText(cause, t.pinError));
    } finally {
      setPinningId(null);
    }
  };
  const setTaskPinned = async (item: TaskAttentionItem, pinned: boolean) => {
    setPinningId(item.task.id);
    setActionError(null);
    try {
      if (pinned) {
        const target = item.targetThreadId ?? taskPinTarget(item.task)?.id;
        if (target === undefined) throw new Error(t.noThread);
        await threadActions.setPinned(target, true);
      } else {
        const pinnedThreads = item.task.threads.filter((thread) => pinnedThreadIds.has(thread.id));
        await Promise.all(pinnedThreads.map((thread) => threadActions.setPinned(thread.id, false)));
      }
    } catch (cause) {
      setActionError(errorText(cause, t.pinError));
    } finally {
      setPinningId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {overview.pmo !== null || pinnedItems.length > 0 || loosePinned.length > 0
          ? (
            <Section label={t.pinned}>
              {overview.pmo !== null
                ? (
                  <PmoRow
                    t={t}
                    thread={overview.pmo}
                    active={activeThreadId === overview.pmo.id}
                    now={now}
                    onOpen={() => open(overview.pmo!)}
                  />
                )
                : null}
              {pinnedItems.map((item) => (
                <TaskRow
                  key={item.task.id}
                  t={t}
                  task={item.task}
                  activeThreadId={activeThreadId}
                  now={now}
                  onOpen={open}
                  reason={attentionReason(t, item)}
                  pinned
                  pinning={pinningId === item.task.id}
                  onTogglePinned={() => void setTaskPinned(item, false)}
                />
              ))}
              {loosePinned.map((thread) => (
                <PinnedThreadRow
                  key={thread.id}
                  t={t}
                  thread={thread}
                  active={activeThreadId === thread.id}
                  now={now}
                  pinning={pinningId === thread.id}
                  onOpen={() => open(thread)}
                  onUnpin={() => void setThreadPinned(thread.id, false)}
                />
              ))}
            </Section>
          )
          : null}

        {nowList.length > 0
          ? (
            <Section label={t.now}>
              {nowList.map((item, index) => {
                const previous = nowList[index - 1];
                const separatesLive = previous?.inbox === true && !item.inbox;
                return (
                  <div key={item.task.id} className={separatesLive ? "mt-1 border-t border-sidebar-border pt-1" : ""}>
                    <TaskRow
                      t={t}
                      task={item.task}
                      activeThreadId={activeThreadId}
                      now={now}
                      onOpen={open}
                      reason={attentionReason(t, item)}
                      pinning={pinningId === item.task.id}
                      onTogglePinned={() =>
                        void setTaskPinned(item, true)}
                    />
                  </div>
                );
              })}
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
              pinning={pinningId === thread.id}
              onOpen={() => open(thread)}
              onPromote={() => void promote(thread)}
              onPin={() => void setThreadPinned(thread.id, true)}
            />
          ))}
          {scratch.length === 0 ? <p className="px-1.5 py-1 text-2xs text-muted-foreground">{t.scratchEmpty}</p> : null}
          {!searching && scratch.length > SCRATCH_PREVIEW
            ? (
              <button
                type="button"
                className="px-1.5 py-1 text-2xs text-muted-foreground hover:text-sidebar-foreground"
                onClick={() => setScratchAll((value) => !value)}
              >
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
                      <TaskRow
                        key={task.id}
                        t={t}
                        task={task}
                        activeThreadId={activeThreadId}
                        now={now}
                        onOpen={open}
                        muted
                        pinning={pinningId === task.id}
                        onTogglePinned={() => void setTaskPinned(taskPinItem(task), true)}
                      />
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
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`size-3 shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function PmoRow(
  { t, thread, active, now, onOpen }: {
    t: Strings;
    thread: ThreadSummary;
    active: boolean;
    now: number;
    onOpen: () => void;
  },
) {
  return (
    <button
      type="button"
      aria-label={t.pmo}
      className={`mt-1 flex min-h-7 w-full items-center gap-1.5 rounded border border-dashed border-sidebar-border px-1.5 text-left text-xs hover:bg-sidebar-accent ${
        active ? "bg-sidebar-accent" : ""
      }`}
      onClick={onOpen}
    >
      <StatusIcon state={attentionOf([thread])} t={t} />
      <span className="font-medium text-sidebar-foreground">{t.pmo}</span>
      <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">{t.pmoHint[thread.status]}</span>
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{relativeAge(thread.updatedAt, now)}</span>
    </button>
  );
}

function taskPinTarget(task: OverviewTask): ThreadSummary | undefined {
  const live = task.threads.filter((thread) => !thread.archived);
  return live.find((thread) => thread.status === "pendingInteraction")
    ?? live.find((thread) => thread.status === "error")
    ?? [...live].filter((thread) => thread.unread).sort((left, right) =>
      (right.latestAttentionAt ?? 0) - (left.latestAttentionAt ?? 0)
    )[0]
    ?? [...live].filter((thread) => thread.status === "running").sort((left, right) =>
      right.updatedAt - left.updatedAt
    )[0]
    ?? [...live].sort((left, right) => right.updatedAt - left.updatedAt)[0];
}

function taskPinItem(task: OverviewTask): TaskAttentionItem {
  const target = taskPinTarget(task);
  return {
    task,
    class: "pinned",
    at: target?.updatedAt ?? task.lastMovedAt ?? 0,
    targetThreadId: target?.id ?? null,
    inbox: false,
  };
}

function attentionReason(t: Strings, item: TaskAttentionItem): string {
  switch (item.class) {
    case "unread":
      return t.nowReason.unread;
    case "seen":
      return t.nowReason.seen;
    case "current":
      return t.nowReason.current;
    case "pinned":
      return reasonText(t, item.task.reason, item.task.reasonPr);
    default:
      return reasonText(t, item.task.reason, item.task.reasonPr);
  }
}

function TaskRow({
  t,
  task,
  activeThreadId,
  now,
  onOpen,
  muted = false,
  reason,
  pinned = false,
  pinning = false,
  onTogglePinned,
}: {
  t: Strings;
  task: OverviewTask;
  activeThreadId: string | null;
  now: number;
  onOpen: (thread: ThreadSummary) => void;
  muted?: boolean;
  reason?: string;
  pinned?: boolean;
  pinning?: boolean;
  onTogglePinned?: () => void;
}) {
  const containsActive = activeThreadId !== null && task.threads.some((thread) => thread.id === activeThreadId);
  const [expanded, setExpanded] = useState(containsActive);
  const [hover, setHover] = useState(false);
  return (
    <article
      className={muted ? "text-muted-foreground" : ""}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(false);
      }}
    >
      <div className="flex min-w-0 items-center">
        <button
          type="button"
          className={`flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 text-left hover:bg-sidebar-accent ${
            containsActive && !expanded ? "bg-sidebar-accent/60" : ""
          }`}
          aria-expanded={expanded}
          title={task.title}
          onClick={() => setExpanded((value) => !value)}
        >
          <StatusIcon state={attentionOf(task.threads)} t={t} />
          <span className="min-w-0 flex-1 truncate text-xs">
            <span className="mr-1 font-mono text-2xs text-muted-foreground">{task.key}</span>
            <span className={muted ? "" : "text-sidebar-foreground"}>{task.title}</span>
          </span>
          <span className="max-w-24 shrink-0 truncate text-2xs text-muted-foreground">
            {reason ?? reasonText(t, task.reason, task.reasonPr)}
          </span>
          {!hover || onTogglePinned === undefined
            ? (
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {relativeAge(task.lastMovedAt, now)}
              </span>
            )
            : null}
        </button>
        {hover && onTogglePinned !== undefined
          ? (
            <button
              type="button"
              className="shrink-0 rounded px-1 py-1 text-2xs text-muted-foreground hover:text-sidebar-foreground disabled:opacity-50"
              title={pinned ? t.unpin : t.pin}
              aria-label={pinned ? t.unpin : t.pin}
              disabled={pinning}
              onClick={onTogglePinned}
            >
              {pinning ? "…" : pinned ? "×" : "↑"}
            </button>
          )
          : null}
      </div>
      {expanded
        ? (
          <div className="ml-3 border-l border-sidebar-border pl-1.5">
            <ThreadTree
              t={t}
              threads={task.threads}
              parentThreadId={null}
              activeThreadId={activeThreadId}
              now={now}
              onOpen={onOpen}
            />
            {task.pullRequests.map((pullRequest) => (
              <a
                key={pullRequest.url}
                href={pullRequest.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate px-1 py-0.5 text-2xs text-muted-foreground hover:text-sidebar-foreground hover:underline"
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

function ThreadTree({ t, threads, parentThreadId, activeThreadId, now, onOpen }: {
  t: Strings;
  threads: readonly ThreadSummary[];
  parentThreadId: string | null;
  activeThreadId: string | null;
  now: number;
  onOpen: (thread: ThreadSummary) => void;
}) {
  const children = threads
    .filter((thread) =>
      thread.parentThreadId === parentThreadId
      || (parentThreadId === null && !threads.some((candidate) => candidate.id === thread.parentThreadId))
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
  return (
    <>
      {children.map((thread) => (
        <div key={thread.id}>
          <button
            type="button"
            className={`flex min-h-6 w-full items-center gap-1.5 rounded px-1 text-left text-2xs hover:bg-sidebar-accent ${
              activeThreadId === thread.id ? "bg-sidebar-accent" : ""
            }`}
            title={thread.archived ? `${thread.title} · ${t.archived}` : thread.title}
            onClick={() => onOpen(thread)}
          >
            <StatusIcon state={attentionOf([thread])} t={t} />
            <span
              className={`min-w-0 flex-1 truncate ${
                thread.archived ? "text-muted-foreground" : "text-sidebar-foreground"
              }`}
            >
              {thread.title}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{relativeAge(thread.updatedAt, now)}</span>
          </button>
          <div className="ml-2 border-l border-sidebar-border pl-1">
            <ThreadTree
              t={t}
              threads={threads}
              parentThreadId={thread.id}
              activeThreadId={activeThreadId}
              now={now}
              onOpen={onOpen}
            />
          </div>
        </div>
      ))}
    </>
  );
}

function PinnedThreadRow({ t, thread, active, now, pinning, onOpen, onUnpin }: {
  t: Strings;
  thread: ThreadSummary;
  active: boolean;
  now: number;
  pinning: boolean;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`flex min-h-7 items-center gap-1.5 rounded px-1.5 text-xs hover:bg-sidebar-accent ${
        active ? "bg-sidebar-accent" : ""
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(false);
      }}
    >
      <StatusIcon state={attentionOf([thread])} t={t} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sidebar-foreground"
        title={thread.title}
        onClick={onOpen}
      >
        {thread.title}
      </button>
      {hover || pinning
        ? (
          <button
            type="button"
            className="shrink-0 rounded px-1 text-2xs text-muted-foreground hover:text-sidebar-foreground disabled:opacity-50"
            disabled={pinning}
            onClick={onUnpin}
          >
            {pinning ? "…" : t.unpin}
          </button>
        )
        : (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {relativeAge(thread.updatedAt, now)}
          </span>
        )}
    </div>
  );
}

function ScratchRow({ t, thread, active, now, promoting, pinning, onOpen, onPromote, onPin }: {
  t: Strings;
  thread: ThreadSummary;
  active: boolean;
  now: number;
  promoting: boolean;
  pinning: boolean;
  onOpen: () => void;
  onPromote: () => void;
  onPin: () => void;
}) {
  // Hover state in React: the plugin CSS build does not emit group-hover variants.
  const [hover, setHover] = useState(false);
  const showActions = hover || promoting || pinning;
  return (
    <div
      className={`flex min-h-7 items-center gap-1.5 rounded px-1.5 text-xs hover:bg-sidebar-accent ${
        active ? "bg-sidebar-accent" : ""
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHover(false);
      }}
    >
      <StatusIcon state={attentionOf([thread])} t={t} />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sidebar-foreground"
        title={thread.title}
        onClick={onOpen}
      >
        {thread.title}
      </button>
      {showActions
        ? (
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              className="rounded px-1 text-2xs text-muted-foreground hover:text-sidebar-foreground disabled:opacity-50"
              disabled={pinning}
              onClick={onPin}
            >
              {pinning ? "…" : t.pin}
            </button>
            <button
              type="button"
              className="rounded px-1 text-2xs text-muted-foreground hover:text-sidebar-foreground disabled:opacity-50"
              disabled={promoting}
              onClick={onPromote}
            >
              {promoting ? t.promoting : t.promote}
            </button>
          </span>
        )
        : (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
            {relativeAge(thread.updatedAt, now)}
          </span>
        )}
    </div>
  );
}
