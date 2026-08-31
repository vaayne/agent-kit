import type { BbPluginApi, PluginAgentConfigurationContext } from "@get-bb/plugin-sdk";
import { listAllTasks, listTaskThreads, type Task, taskThreadsAttach, taskThreadsDetach } from "./tasks-client.js";

const MAX_PARENT_DEPTH = 10;
// A full rebuild is one listTasks plus one listTaskThreads per task; fan-out spawns must not repeat it per child.
const REBUILD_TTL_MS = 30_000;

export interface TaskBinding {
  taskId: string;
  key: string;
  title: string;
}

function bindingFor(task: Task): TaskBinding {
  return {
    taskId: task.id,
    key: task.key ?? task.id,
    title: task.title,
  };
}

export function taskInstructions(binding: TaskBinding): string {
  return `This thread belongs to task ${binding.key} (${binding.title}). Before you finish: post a comment starting with 'Next:' stating the single next step (or 'Next: none'), and a short result comment.`;
}

/** Maintains the ephemeral thread → task index used by lifecycle hooks. */
export class TaskBindings {
  private readonly byThreadId = new Map<string, TaskBinding>();
  private rebuildPromise: Promise<void> | null = null;
  private rebuiltAt = 0;

  constructor(private readonly bb: BbPluginApi) {}

  get(threadId: string): TaskBinding | undefined {
    return this.byThreadId.get(threadId);
  }

  remember(task: Task, taskThreads: readonly { threadId: string }[]): void {
    const binding = bindingFor(task);
    for (const taskThread of taskThreads) {
      this.byThreadId.set(taskThread.threadId, binding);
    }
  }

  getForAgentContext(
    context: PluginAgentConfigurationContext,
  ): TaskBinding | undefined {
    return this.get(context.thread.id)
      ?? (context.thread.parentThreadId === null
        ? undefined
        : this.get(context.thread.parentThreadId));
  }

  forget(threadId: string): void {
    this.byThreadId.delete(threadId);
  }

  /** Move a thread to another task; the previous task loses it so it never shows under two trees. */
  async rebind(threadId: string, task: Task): Promise<void> {
    const previous = this.get(threadId);
    if (previous !== undefined && previous.taskId !== task.id) {
      await taskThreadsDetach(this.bb, previous.taskId, threadId);
    }
    await taskThreadsAttach(this.bb, task.id, threadId);
    this.remember(task, [{ threadId }]);
  }

  /** Drop a thread from its task on both sides; a no-op when it was never bound. */
  async detach(threadId: string): Promise<void> {
    const binding = this.get(threadId);
    this.forget(threadId);
    if (binding !== undefined) {
      await taskThreadsDetach(this.bb, binding.taskId, threadId);
    }
  }

  async rebuild(): Promise<void> {
    if (this.rebuildPromise !== null) return this.rebuildPromise;
    this.rebuildPromise = this.load().finally(() => {
      this.rebuildPromise = null;
    });
    return this.rebuildPromise;
  }

  private async ensureFresh(): Promise<void> {
    if (Date.now() - this.rebuiltAt < REBUILD_TTL_MS) return;
    await this.rebuild();
  }

  private async load(): Promise<void> {
    const tasks = await listAllTasks(this.bb);
    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        const { taskThreads } = await listTaskThreads(this.bb, task.id);
        // Merge instead of clear-and-refill so bindings written while this snapshot was in flight survive.
        this.remember(task, taskThreads);
      }),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.bb.log.warn(
          `Could not rebuild one task's thread bindings: ${errorMessage(result.reason)}`,
        );
      }
    }
    this.rebuiltAt = Date.now();
  }

  async findAncestor(threadId: string): Promise<TaskBinding | undefined> {
    await this.ensureFresh();
    let currentId: string | null = threadId;
    for (let depth = 0; currentId !== null && depth < MAX_PARENT_DEPTH; depth++) {
      const binding = this.get(currentId);
      if (binding !== undefined) return binding;
      const thread = await this.bb.sdk.threads.get({ threadId: currentId });
      currentId = thread.parentThreadId;
    }
    return undefined;
  }

  async inherit(thread: {
    id: string;
    parentThreadId: string | null;
  }): Promise<TaskBinding | undefined> {
    if (thread.parentThreadId === null) return undefined;
    const binding = await this.findAncestor(thread.parentThreadId);
    if (binding === undefined) return undefined;
    await taskThreadsAttach(this.bb, binding.taskId, thread.id);
    this.byThreadId.set(thread.id, binding);
    return binding;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
