import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRpc,
  type PluginNewThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { useState } from "react";
import type { taskNavigatorRpc } from "./server.js";

export function NewTaskAction({ projectId }: PluginNewThreadPanelProps) {
  const rpc = useRpc<typeof taskNavigatorRpc>();
  const actions = useSidebarThreadActions();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await rpc.call("createTaskAndSpawn", { bbProjectId: projectId, title: title.trim() });
      actions.open(result.threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create task.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 p-4 text-sm">
      <h2 className="font-semibold">先建 task</h2>
      <p className="text-muted-foreground">输入一句标题，创建 task 并启动首个线程。</p>
      <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <input autoFocus value={title} disabled={busy} className="w-full rounded border border-input bg-background px-2 py-1.5" placeholder="我要做什么？" onChange={(event) => setTitle(event.target.value)} />
        <button type="submit" disabled={busy || !title.trim()} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">
          {busy ? "创建中…" : "创建并开始"}
        </button>
      </form>
      {error !== null ? <p role="alert" className="text-destructive">{error}</p> : null}
    </section>
  );
}
