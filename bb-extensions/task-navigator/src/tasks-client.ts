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
    number: z.number().int().positive().optional(),
    projectPrefix: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
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
const commentSchema = z
  .object({
    id: taskIdSchema,
    taskId: taskIdSchema,
    kind: z.enum(["user", "agent", "system"]),
    authorName: z.string(),
    presetName: z.string().nullable(),
    threadId: threadIdSchema.nullable(),
    body: z.string(),
    notifiedCount: z.number().int().nonnegative(),
    createdAt: z.string(),
  })
  .passthrough();

const taskProjectSchema = z
  .object({
    id: taskIdSchema,
    name: z.string(),
    prefix: z.string(),
    nextTaskNumber: z.number().int().positive(),
    color: z.string(),
    folderId: taskIdSchema.nullable(),
    linkedBbProjectId: z.string().startsWith("proj_").nullable(),
    createdAt: z.string(),
  })
  .passthrough();
const listTasksOutputSchema = z
  .object({
    tasks: z.array(taskSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
const listProjectsOutputSchema = z
  .object({ projects: z.array(taskProjectSchema) })
  .strict();
const createTaskOutputSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), task: taskSchema }).strict(),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }).passthrough(),
  }).strict(),
]);
const updateTaskOutputSchema = createTaskOutputSchema;
const createCommentOutputSchema = z
  .object({ comment: commentSchema })
  .strict();
const presetSchema = z
  .object({ id: taskIdSchema, name: z.string() })
  .passthrough();
const listPresetsOutputSchema = z
  .object({ presets: z.array(presetSchema) })
  .strict();
const delegateOutputSchema = z
  .object({ threadId: threadIdSchema })
  .strict();
const getTaskOutputSchema = z
  .object({ task: taskSchema.nullable() })
  .strict();
const listTaskThreadsOutputSchema = z
  .object({ taskThreads: z.array(taskThreadSchema) })
  .strict();
const listCommentsOutputSchema = z
  .object({ comments: z.array(commentSchema) })
  .strict();
const taskThreadMutationOutputSchema = z
  .object({ threadId: threadIdSchema })
  .strict();

export type ListTasksInput = z.infer<typeof listTasksInputSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskProject = z.infer<typeof taskProjectSchema>;
export type TaskThread = z.infer<typeof taskThreadSchema>;
export type TaskComment = z.infer<typeof commentSchema>;
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

const TASKS_PAGE_LIMIT = 500;

/** Tasks paginates at 100 by default; a navigator must see every task or threads silently fall back to Unfiled. */
export async function listAllTasks(
  bb: BbPluginApi,
  input: Omit<ListTasksInput, "limit" | "cursor"> = {},
): Promise<Task[]> {
  const tasks: Task[] = [];
  let cursor: string | undefined;
  do {
    const page = await listTasks(bb, {
      ...input,
      limit: TASKS_PAGE_LIMIT,
      ...(cursor === undefined ? {} : { cursor }),
    });
    tasks.push(...page.tasks);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return tasks;
}

export async function listProjects(
  bb: BbPluginApi,
): Promise<z.infer<typeof listProjectsOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "listProjects",
    input: {},
    outputSchema: listProjectsOutputSchema,
  });
}

export async function createTask(
  bb: BbPluginApi,
  input: {
    projectId: string;
    title: string;
  },
): Promise<z.infer<typeof createTaskOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "createTask",
    input: {
      projectId: taskIdSchema.parse(input.projectId),
      title: z.string().trim().min(1).parse(input.title),
    },
    outputSchema: createTaskOutputSchema,
  });
}

export async function listPresets(
  bb: BbPluginApi,
): Promise<z.infer<typeof listPresetsOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "listPresets",
    input: null,
    outputSchema: listPresetsOutputSchema,
  });
}

export async function delegate(
  bb: BbPluginApi,
  input: { taskId: string; presetId: string; extraInstructions?: string },
): Promise<z.infer<typeof delegateOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "delegate",
    input: {
      taskId: taskIdSchema.parse(input.taskId),
      presetId: taskIdSchema.parse(input.presetId),
      ...(input.extraInstructions === undefined ? {} : { extraInstructions: input.extraInstructions }),
    },
    outputSchema: delegateOutputSchema,
  });
}

export async function updateTask(
  bb: BbPluginApi,
  input: { taskId: string; status: "canceled" },
): Promise<z.infer<typeof updateTaskOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "updateTask",
    input: {
      taskId: taskIdSchema.parse(input.taskId),
      status: input.status,
    },
    outputSchema: updateTaskOutputSchema,
  });
}

export async function createComment(
  bb: BbPluginApi,
  input: { taskId: string; body: string; notify?: boolean },
): Promise<z.infer<typeof createCommentOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "createComment",
    input: {
      taskId: taskIdSchema.parse(input.taskId),
      body: z.string().trim().min(1).parse(input.body),
      notify: input.notify ?? false,
    },
    outputSchema: createCommentOutputSchema,
  });
}

export async function getTaskByKey(
  bb: BbPluginApi,
  taskKey: string,
): Promise<z.infer<typeof getTaskOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "getTaskByKey",
    input: { taskKey: z.string().trim().min(1).parse(taskKey) },
    outputSchema: getTaskOutputSchema,
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

export async function listComments(
  bb: BbPluginApi,
  taskId: string,
): Promise<z.infer<typeof listCommentsOutputSchema>> {
  return bb.sdk.plugins.callRpc({
    pluginId: "tasks",
    method: "listComments",
    input: { taskId: taskIdSchema.parse(taskId) },
    outputSchema: listCommentsOutputSchema,
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
