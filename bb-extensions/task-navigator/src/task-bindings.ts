import type {
  BbPluginApi,
  PluginAgentConfigurationContext,
} from "@get-bb/plugin-sdk";
import {
  listTaskThreads,
  listTasks,
  taskThreadsAttach,
  type Task,
} from "./tasks-client.js";

const MAX_PARENT_DEPTH = 10;

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

  constructor(private readonly bb: BbPluginApi) {}

  get(threadId: string): TaskBinding | undefined {
    return this.byThreadId.get(threadId);
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

  async rebuild(): Promise<void> {
    if (this.rebuildPromise !== null) return this.rebuildPromise;
    this.rebuildPromise = this.load().finally(() => {
      this.rebuildPromise = null;
    });
    return this.rebuildPromise;
  }

  private async load(): Promise<void> {
    const { tasks } = await listTasks(this.bb);
    const next = new Map<string, TaskBinding>();
    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        const { taskThreads } = await listTaskThreads(this.bb, task.id);
        const binding = bindingFor(task);
        for (const taskThread of taskThreads) {
          next.set(taskThread.threadId, binding);
        }
      }),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        this.bb.log.warn(
          `Could not rebuild one task's thread bindings: ${errorMessage(result.reason)}`,
        );
      }
    }
    this.byThreadId.clear();
    for (const [threadId, binding] of next) {
      this.byThreadId.set(threadId, binding);
    }
  }

  async findAncestor(threadId: string): Promise<TaskBinding | undefined> {
    await this.rebuild();
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
