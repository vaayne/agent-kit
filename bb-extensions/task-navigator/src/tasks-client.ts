import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const taskIdSchema = z
  .string()
  .regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/, "must be a ULID");
const threadIdSchema = z.string().startsWith("thr_");
const taskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
]);
const taskPrioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);
const taskSortSchema = z.enum(["manual", "priority", "due"]);

/**
 * These method names and wire inputs mirror the built-in Tasks plugin's RPC
 * contracts. Keep this boundary in one file so later derived views do not
 * depend on the built-in plugin's implementation details.
 */
const listTasksInputSchema = z
  .object({
    projectId: taskIdSchema.optional(),
    statuses: z.array(taskStatusSchema).optional(),
    priorities: z.array(taskPrioritySchema).optional(),
    labelIds: z.array(taskIdSchema).optional(),
    activeOnly: z.boolean().optional(),
    parentTaskId: taskIdSchema.nullable().optional(),
    search: z.string().optional(),
    sort: taskSortSchema.optional(),
    limit: z.number().int().min(1).max(500).optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();

const taskSchema = z
  .object({
    id: taskIdSchema,
    projectId: taskIdSchema,
    title: z.string(),
    description: z.string(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    dueDate: z.string().nullable(),
    parentTaskId: taskIdSchema.nullable(),
    labelIds: z.array(taskIdSchema),
    key: z.string().optional(),
    projectPrefix: z.string().optional(),
  })
  .passthrough();

const taskThreadSchema = z
  .object({
    id: taskIdSchema,
    taskId: taskIdSchema,
    threadId: threadIdSchema,
    presetName: z.string(),
    title: z.string(),
    liveStatus: z.string(),
    attachedAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

const listTasksOutputSchema = z
  .object({
    tasks: z.array(taskSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
const getTaskOutputSchema = z
  .object({ task: taskSchema.nullable() })
  .strict();
const listTaskThreadsOutputSchema = z
  .object({ taskThreads: z.array(taskThreadSchema) })
  .strict();
const taskThreadMutationOutputSchema = z
  .object({ threadId: threadIdSchema })
  .strict();

export type ListTasksInput = z.infer<typeof listTasksInputSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskThread = z.infer<typeof taskThreadSchema>;
export type ListTasksResult = z.infer<typeof listTasksOutputSchema>;

export async function listTasks(
  bb: BbPluginApi,
  input: ListTasksInput = {},
): Promise<ListTasksResult> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "listTasks",
    input: listTasksInputSchema.parse(input),
    outputSchema: listTasksOutputSchema,
  });
}

export async function getTask(
  bb: BbPluginApi,
  taskId: string,
): Promise<z.infer<typeof getTaskOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "getTask",
    input: { taskId: taskIdSchema.parse(taskId) },
    outputSchema: getTaskOutputSchema,
  });
}

export async function listTaskThreads(
  bb: BbPluginApi,
  taskId: string,
): Promise<z.infer<typeof listTaskThreadsOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "listTaskThreads",
    input: { taskId: taskIdSchema.parse(taskId) },
    outputSchema: listTaskThreadsOutputSchema,
  });
}

export async function taskThreadsAttach(
  bb: BbPluginApi,
  taskId: string,
  threadId: string,
): Promise<z.infer<typeof taskThreadMutationOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "taskThreadsAttach",
    input: {
      taskId: taskIdSchema.parse(taskId),
      threadId: threadIdSchema.parse(threadId),
    },
    outputSchema: taskThreadMutationOutputSchema,
  });
}

export async function taskThreadsDetach(
  bb: BbPluginApi,
  taskId: string,
  threadId: string,
): Promise<z.infer<typeof taskThreadMutationOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "taskThreadsDetach",
    input: {
      taskId: taskIdSchema.parse(taskId),
      threadId: threadIdSchema.parse(threadId),
    },
    outputSchema: taskThreadMutationOutputSchema,
  });
}
