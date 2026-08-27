import { useRpc, type PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";
import type { Overview, OverviewTask, taskNavigatorRpc } from "./server.js";
import { reasonText } from "./strings.js";
import { errorText, useOpenThread, useStrings, useTaskOverview } from "./useTaskOverview.js";

export function ThreadTaskPanel({ threadId }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const openThread = useOpenThread();
  const { overview, error, loading, reload } = useTaskOverview();
  const t = useStrings();
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [taskKey, setTaskKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void rpc.call("lastAgentMessage", { threadId }).then((result) => {
      if (!cancelled) setLastMessage(result.text);
    }).catch(() => {
      if (!cancelled) setLastMessage(null);
    });
    return () => {
      cancelled = true;
    };
  }, [rpc, threadId]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">{t.loading}</p>;
  if (overview === null) return <p className="p-4 text-sm text-destructive">{error ?? t.loadError}</p>;
  const task = findTask(overview.groups, threadId);
  const bind = async () => {
    if (!taskKey.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await rpc.call("attachThread", { taskKey: taskKey.trim(), threadId });
      setTaskKey("");
      await reload();
    } catch (cause) {
      setActionError(errorText(cause, t.panel.rebindError));
    } finally {
      setBusy(false);
    }
  };
  const promote = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await rpc.call("promoteThread", { threadId });
      await reload();
    } catch (cause) {
      setActionError(errorText(cause, t.panel.promoteError));
    } finally {
      setBusy(false);
    }
  };
  const rebindForm = (
    <form className="space-y-2 border-t border-border pt-3" onSubmit={(event) => { event.preventDefault(); void bind(); }}>
      <label className="block text-xs text-muted-foreground">{task === undefined ? t.panel.fileTo : t.panel.rebindTo}</label>
      <div className="flex gap-2">
        <input value={taskKey} disabled={busy} className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm" placeholder={t.panel.keyPlaceholder} onChange={(event) => setTaskKey(event.target.value)} />
        <button type="submit" disabled={busy || !taskKey.trim()} className="rounded border border-input px-2 py-1 text-xs disabled:opacity-50">{task === undefined ? t.panel.file : t.panel.rebind}</button>
      </div>
    </form>
  );
  const errorLine = actionError !== null ? <p role="alert" className="text-xs text-destructive">{actionError}</p> : null;
  const filedKey = overview.filed[threadId];
  if (task === undefined && filedKey !== undefined) {
    return (
      <section className="space-y-3 p-4 text-sm">
        <h2 className="font-semibold">{t.panel.title}</h2>
        <p className="font-mono text-xs text-muted-foreground">{filedKey}</p>
        <p className="text-muted-foreground">{t.panel.ended}</p>
        {rebindForm}
        {errorLine}
      </section>
    );
  }
  if (task === undefined) {
    return (
      <section className="space-y-3 p-4 text-sm">
        <h2 className="font-semibold">{t.panel.title}</h2>
        <p className="text-muted-foreground">{t.panel.unfiled}</p>
        <button type="button" disabled={busy} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void promote()}>
          {busy ? t.panel.busy : t.panel.promote}
        </button>
        {rebindForm}
        {errorLine}
      </section>
    );
  }
  const current = task.threads.find((thread) => thread.id === threadId);
  const siblings = task.threads.filter((thread) => thread.id !== threadId);
  return (
    <section className="space-y-4 overflow-y-auto p-4 text-sm">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{task.key}</p>
        <h2 className="mt-1 font-semibold">{task.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{reasonText(t, task.reason, task.reasonPr)}</p>
      </div>
      {lastMessage !== null ? (
        <div className="rounded border border-border p-2">
          <p className="text-xs text-muted-foreground">{t.panel.lastHere}</p>
          <p className="mt-1">{lastMessage}</p>
        </div>
      ) : null}
      <div>
        <p className="text-xs text-muted-foreground">{t.panel.next}</p>
        <p className="mt-1">{task.next ?? t.panel.noNext}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{t.panel.currentThread}</p>
        <p className="mt-1">{current?.title ?? threadId}</p>
      </div>
      {siblings.length > 0 ? (
        <div>
          <p className="text-xs text-muted-foreground">{t.panel.siblings}</p>
          <div className="mt-1 space-y-1">
            {siblings.map((sibling) => (
              <button key={sibling.id} type="button" className="block w-full truncate text-left hover:underline" onClick={() => openThread(sibling)}>
                {sibling.title}{sibling.archived ? ` · ${t.archived}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {task.pullRequests.length > 0 ? (
        <div>
          <p className="text-xs text-muted-foreground">{t.panel.pr}</p>
          {task.pullRequests.map((pullRequest) => (
            <a key={pullRequest.url} href={pullRequest.url} target="_blank" rel="noreferrer" className="mt-1 block hover:underline">
              #{pullRequest.number} {pullRequest.title} · {pullRequest.state}
            </a>
          ))}
        </div>
      ) : null}
      {rebindForm}
      {errorLine}
    </section>
  );
}

function findTask(
  groups: Overview["groups"],
  threadId: string,
): OverviewTask | undefined {
  return [groups.you, groups.running, groups.stalled, groups.waiting, groups.backlog, groups.done]
    .flat()
    .find((task) => task.threads.some((thread) => thread.id === threadId));
}
