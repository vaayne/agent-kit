import {
  useRpc,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginNavPanelProps,
} from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import type { OverviewTask, taskNavigatorRpc } from "./server.js";
import { useTaskOverview } from "./useTaskOverview.js";

export function InboxPanel({}: PluginNavPanelProps) {
  const { overview, error, loading, reload } = useTaskOverview();
  if (loading) return <PanelMessage>Loading tasks…</PanelMessage>;
  if (error !== null && overview === null) return <PanelMessage tone="error">{error}</PanelMessage>;
  if (overview === null) return <PanelMessage>没有事轮到你</PanelMessage>;
  const tasks = overview.groups.you;
  if (tasks.length === 0) {
    return <PanelMessage>没有事轮到你</PanelMessage>;
  }
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-5">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">收件箱</p>
        <h1 className="mt-1 text-xl font-semibold">现在轮到我的</h1>
      </header>
      <InboxCard task={tasks[0]!} onChanged={reload} />
      {tasks.length > 1 ? (
        <p className="text-sm text-muted-foreground">还有 {tasks.length - 1} 件</p>
      ) : null}
    </main>
  );
}

function InboxCard({
  task,
  onChanged,
}: {
  task: OverviewTask;
  onChanged: () => Promise<void>;
}) {
  const actions = useSidebarThreadActions();
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const [nextValue, setNextValue] = useState("");
  const [saving, setSaving] = useState(false);
  const thread = task.threads.find((candidate) =>
    candidate.status === "pendingInteraction" || candidate.status === "error"
  ) ?? task.threads[0];
  const pullRequest = task.pullRequests[0];
  const writeNext = async () => {
    if (!nextValue.trim()) return;
    setSaving(true);
    try {
      await rpc.call("writeNext", { taskId: task.id, next: nextValue.trim() });
      setNextValue("");
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{task.key}</p>
        <h2 className="mt-1 text-lg font-semibold">{task.title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{task.reason}</p>
      </div>
      {pullRequest !== undefined ? (
        <a
          href={pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          打开 PR #{pullRequest.number}
        </a>
      ) : thread !== undefined ? (
        <button
          type="button"
          className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:opacity-90"
          onClick={() => actions.open(thread.id)}
        >
          打开线程回答
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">暂无线程</span>
      )}
      {task.group === "stalled" || thread === undefined ? (
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void writeNext();
          }}
        >
          <label className="block text-sm font-medium">写下一步</label>
          <div className="flex gap-2">
            <input
              value={nextValue}
              disabled={saving}
              className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
              placeholder="下一步谁做什么"
              onChange={(event) => setNextValue(event.target.value)}
            />
            <button type="submit" disabled={saving || !nextValue.trim()} className="rounded border border-input px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      ) : null}
      <button
        type="button"
        className="text-xs text-muted-foreground underline hover:text-foreground"
        onClick={() => void onChanged()}
      >
        刷新收件箱
      </button>
    </article>
  );
}

function PanelMessage({ children, tone = "muted" }: { children: string; tone?: "muted" | "error" }) {
  return <main className={`p-5 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>{children}</main>;
}
