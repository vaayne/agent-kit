import { type BbPluginApi, defineRpcContract } from "@get-bb/plugin-sdk";
import type { NewThreadRequest } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import type { UsageLimitsResult, UsageProvider, UsageResponse, UsageWindow } from "./usage.js";

const PR_CACHE_PREFIX = "pull-request:";
const USAGE_CACHE_MS = 30_000;
const environmentNameSchema = z.string().trim().min(1).max(80);
const prSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string().url(),
  state: z.enum(["draft", "open", "merged", "closed"]),
  attention: z.enum([
    "checks_failed",
    "checks_pending",
    "changes_requested",
    "review_requested",
    "conflicts",
    "blocked",
    "draft",
    "ready_to_merge",
    "merged",
    "closed",
    "none",
  ]),
});
const cachedPrSchema = z.object({
  pullRequest: prSchema.nullable(),
  fetchedAt: z.number(),
});
type CachedPr = z.infer<typeof cachedPrSchema>;

const usageWindowSchema = z
  .object({
    label: z.string().min(1),
    usedPercent: z.number().min(0).max(100),
    resetsAt: z.string().min(1).nullable(),
    cost: z
      .object({
        usedUsdCents: z.number().int().nonnegative(),
        limitUsdCents: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
const usageProviderSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ok"),
      planLabel: z.string().min(1).nullable(),
      windows: z.array(usageWindowSchema),
    })
    .strict(),
  z.object({ status: z.literal("not_installed") }).strict(),
  z.object({ status: z.literal("unauthenticated") }).strict(),
  z.object({ status: z.literal("expired") }).strict(),
  z
    .object({
      status: z.literal("error"),
      message: z.string().min(1),
      planLabel: z.string().min(1).nullable(),
    })
    .strict(),
]);
const usageResponseSchema = z.record(z.string().min(1), usageProviderSchema);
const usageLimitsResultSchema = z
  .object({
    usage: usageResponseSchema.nullable(),
    fetchedAt: z.number().nullable(),
    isStale: z.boolean(),
    error: z.string().nullable(),
  })
  .strict();
type CachedUsage = { usage: UsageResponse; fetchedAt: number };
type RawUsageResponse = Awaited<
  ReturnType<BbPluginApi["sdk"]["system"]["usageLimits"]>
>;

function refreshAfterMs(cached: CachedPr): number {
  if (cached.pullRequest?.attention === "checks_pending") return 2 * 60_000;
  if (
    cached.pullRequest?.state === "merged"
    || cached.pullRequest?.state === "closed"
  ) {
    return 60 * 60_000;
  }
  return 10 * 60_000;
}

function isNewThreadRequest(value: unknown): value is NewThreadRequest {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Record<string, unknown>;
  const isNonEmptyString = (field: unknown) => typeof field === "string" && field.length > 0;
  return (
    isNonEmptyString(request.projectId)
    && isNonEmptyString(request.providerId)
    && isNonEmptyString(request.model)
    && isNonEmptyString(request.reasoningLevel)
    && isNonEmptyString(request.permissionMode)
    && typeof request.executionInputSources === "object"
    && request.executionInputSources !== null
    && typeof request.environment === "object"
    && request.environment !== null
    && Array.isArray(request.input)
    && request.input.length > 0
  );
}

const newThreadRequestSchema = z.custom<NewThreadRequest>(isNewThreadRequest, {
  message: "Expected a NewThreadRequest from the bb composer",
});

export const workspaceNavigatorRpc = defineRpcContract({
  createThread: {
    input: z.object({ request: newThreadRequestSchema }).strict(),
    output: z.object({ threadId: z.string() }).strict(),
  },
  archiveWorktree: {
    input: z.object({ environmentId: z.string().min(1) }).strict(),
    output: z.object({ archivedThreadIds: z.array(z.string()) }).strict(),
  },
  renameWorktree: {
    input: z
      .object({
        environmentId: z.string().min(1),
        name: environmentNameSchema.nullable(),
      })
      .strict(),
    output: z.object({ name: z.string().nullable() }).strict(),
  },
  pullRequest: {
    input: z.object({ environmentId: z.string().min(1) }).strict(),
    output: z
      .object({
        pullRequest: prSchema.nullable(),
        fetchedAt: z.number().nullable(),
        isStale: z.boolean(),
      })
      .strict(),
  },
  usageLimits: {
    input: z.object({ force: z.boolean() }).strict(),
    output: usageLimitsResultSchema,
  },
});

function projectUsageWindow(window: {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
  cost?: { usedUsdCents: number; limitUsdCents: number };
}): UsageWindow {
  return {
    label: window.label,
    usedPercent: window.usedPercent,
    resetsAt: window.resetsAt,
    ...(window.cost === undefined
      ? {}
      : {
        cost: {
          usedUsdCents: window.cost.usedUsdCents,
          limitUsdCents: window.cost.limitUsdCents,
        },
      }),
  };
}

function projectUsageProvider(
  provider: RawUsageResponse[keyof RawUsageResponse],
): UsageProvider {
  switch (provider.status) {
    case "ok":
      return {
        status: "ok",
        planLabel: provider.planLabel,
        windows: provider.windows.map(projectUsageWindow),
      };
    case "error":
      return {
        status: "error",
        message: provider.message,
        planLabel: provider.planLabel,
      };
    case "not_installed":
    case "unauthenticated":
    case "expired":
      return { status: provider.status };
  }
}

/** Project the daemon response before it crosses into the browser, stripping email. */
function projectUsage(response: RawUsageResponse): UsageResponse {
  return Object.fromEntries(
    Object.entries(response).map(([id, provider]) => [
      id,
      projectUsageProvider(provider),
    ]),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Could not load usage from the BB primary machine.";
}

export default function plugin(bb: BbPluginApi) {
  let cachedUsage: CachedUsage | null = null;
  const cacheKey = (environmentId: string) => `${PR_CACHE_PREFIX}${environmentId}`;
  const readCached = async (
    environmentId: string,
  ): Promise<CachedPr | null> => {
    const value = await bb.storage.kv.get<unknown>(cacheKey(environmentId));
    const parsed = cachedPrSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  };
  const refresh = async (environmentId: string): Promise<CachedPr> => {
    const result = await bb.sdk.environments.pullRequest({ environmentId });
    if (result.outcome === "unavailable") throw new Error(result.message);
    const cached: CachedPr = {
      pullRequest: result.outcome === "available"
        ? {
          number: result.pullRequest.number,
          title: result.pullRequest.title,
          url: result.pullRequest.url,
          state: result.pullRequest.state,
          attention: result.pullRequest.attention,
        }
        : null,
      fetchedAt: Date.now(),
    };
    await bb.storage.kv.set(cacheKey(environmentId), cached);
    return cached;
  };

  bb.rpc.register(workspaceNavigatorRpc, {
    async createThread({ request }) {
      const thread = await bb.sdk.threads.spawn(request);
      return { threadId: thread.id };
    },
    async archiveWorktree({ environmentId }) {
      const result = await bb.sdk.environments.archiveThreads({
        environmentId,
      });
      return { archivedThreadIds: result.archivedThreadIds };
    },
    async renameWorktree({ environmentId, name }) {
      const environment = await bb.sdk.environments.update({
        environmentId,
        name,
      });
      return { name: environment.name };
    },
    async pullRequest({ environmentId }) {
      const cached = await readCached(environmentId);
      if (cached && Date.now() - cached.fetchedAt < refreshAfterMs(cached)) {
        return { ...cached, isStale: false };
      }
      try {
        return { ...(await refresh(environmentId)), isStale: false };
      } catch (error) {
        bb.log.warn(
          `PR refresh for ${environmentId} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return cached
          ? { ...cached, isStale: true }
          : { pullRequest: null, fetchedAt: null, isStale: true };
      }
    },
    async usageLimits({ force }): Promise<UsageLimitsResult> {
      if (
        !force
        && cachedUsage !== null
        && Date.now() - cachedUsage.fetchedAt < USAGE_CACHE_MS
      ) {
        return { ...cachedUsage, isStale: false, error: null };
      }
      try {
        // No host ID selects BB's primary machine; the daemon owns credentials.
        const usage = projectUsage(await bb.sdk.system.usageLimits());
        cachedUsage = { usage, fetchedAt: Date.now() };
        return { ...cachedUsage, isStale: false, error: null };
      } catch (error) {
        const message = errorMessage(error);
        bb.log.warn(`Usage refresh failed: ${message}`);
        return cachedUsage
          ? { ...cachedUsage, isStale: true, error: message }
          : { usage: null, fetchedAt: null, isStale: false, error: message };
      }
    },
  });
}
