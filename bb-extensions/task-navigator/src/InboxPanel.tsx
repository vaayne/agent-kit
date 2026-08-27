import { useRpc, type PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import type { OverviewTask, taskNavigatorRpc } from "./server.js";
import { reasonText, type Strings } from "./strings.js";
import { errorText, primaryThread, useOpenThread, useStrings, useTaskOverview } from "./useTaskOverview.js";

export function InboxPanel({}: PluginNavPanelProps) {
  const { overview, error, loading, reload } = useTaskOverview();
  const t = useStrings();
  if (loading) return <PanelMessage>{t.loading}</PanelMessage>;
  if (error !== null && overview === null) return <PanelMessage tone="error">{error}</PanelMessage>;
  if (overview === null) return <PanelMessage>{t.inbox.empty}</PanelMessage>;
  const tasks = overview.groups.you;
  if (tasks.length === 0) {
    return <PanelMessage>{t.inbox.empty}</PanelMessage>;
  }
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-5">
      <header>
        <h1 className="text-xl font-semibold">{t.inbox.title}</h1>
      </header>
      <InboxCard t={t} task={tasks[0]!} onChanged={reload} />
      {tasks.length > 1 ? (
        <p className="text-sm text-muted-foreground">{t.inbox.more(tasks.length - 1)}</p>
      ) : null}
    </main>
  );
}

function InboxCard({
  t,
  task,
  onChanged,
}: {
  t: Strings;
  task: OverviewTask;
  onChanged: () => Promise<void>;
}) {
  const openThread = useOpenThread();
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const [nextValue, setNextValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asking = task.threads.find((candidate) =>
    candidate.status === "pendingInteraction" || candidate.status === "error"
  );
  const thread = primaryThread(task.threads);
  const openPullRequest = task.pullRequests.find((pullRequest) => pullRequest.state === "open");
  const writeNext = async () => {
    if (!nextValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await rpc.call("writeNext", { taskId: task.id, next: nextValue.trim() });
      setNextValue("");
      await onChanged();
    } catch (cause) {
      setError(errorText(cause, t.inbox.saveError));
    } finally {
      setSaving(false);
    }
  };

  // The button follows the same precedence as the reason text: a thread asking beats a PR waiting.
  const action = asking !== undefined
    ? { label: t.inbox.openThreadAnswer, run: () => openThread(asking) }
    : openPullRequest !== undefined
    ? { label: t.inbox.openPr(openPullRequest.number), href: openPullRequest.url }
    : thread !== undefined
    ? { label: t.inbox.openThread, run: () => openThread(thread) }
    : null;

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{task.key}</p>
        <h2 className="mt-1 text-lg font-semibold">{task.title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{reasonText(t, task.reason, task.reasonPr)}</p>
      </div>
      {action === null
        ? <span className="text-sm text-muted-foreground">{t.inbox.noThread}</span>
        : "href" in action
        ? (
          <a href={action.href} target="_blank" rel="noreferrer" className="inline-flex rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90">
            {action.label}
          </a>
        )
        : (
          <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90" onClick={action.run}>
            {action.label}
          </button>
        )}
      {task.group === "stalled" || thread === undefined ? (
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void writeNext();
          }}
        >
          <label className="block text-sm font-medium">{t.inbox.writeNext}</label>
          <div className="flex gap-2">
            <input
              value={nextValue}
              disabled={saving}
              className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
              placeholder={t.inbox.nextPlaceholder}
              onChange={(event) => setNextValue(event.target.value)}
            />
            <button type="submit" disabled={saving || !nextValue.trim()} className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? t.inbox.saving : t.inbox.save}
            </button>
          </div>
        </form>
      ) : null}
      {error !== null ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <button
        type="button"
        className="text-xs text-muted-foreground underline hover:text-foreground"
        onClick={() => void onChanged()}
      >
        {t.inbox.refresh}
      </button>
    </article>
  );
}

function PanelMessage({ children, tone = "muted" }: { children: string; tone?: "muted" | "error" }) {
  return <main className={`p-5 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>{children}</main>;
}
