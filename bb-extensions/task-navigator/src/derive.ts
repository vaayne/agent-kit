export type DerivedGroup = "you" | "running" | "stalled" | "waiting" | "backlog" | "none";
export type WaitingOn = "you" | "agent" | "ci" | "nobody";

export interface DerivedThread {
  status: "running" | "pendingInteraction" | "error" | "idle";
  /** Archived threads are history: a dead errored attempt is not someone asking you. */
  archived?: boolean;
}

export type PullRequestChecks = "pending" | "passing" | "failing" | "no_checks" | "unknown";

export interface DerivedPullRequest {
  number: number;
  state: "open" | "draft" | "merged" | "closed";
  checks: PullRequestChecks;
}

export interface DeriveTaskInput {
  status: string;
  threads: readonly DerivedThread[];
  pullRequests: readonly DerivedPullRequest[];
  next: string | null;
}

/** Why a task sits where it sits. A code, not a sentence: the UI renders it in the user's language. */
export const REASON_CODES = [
  "ended", "notStarted", "noThreads", "asking", "error", "running",
  "ciPending", "ciFailed", "reviewPassing", "review", "stalled", "waitingAgent",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface DerivedTaskState {
  group: DerivedGroup;
  waitingOn: WaitingOn;
  reason: ReasonCode;
  /** The pull request the reason refers to, for the ci/review codes. */
  reasonPr: number | null;
}

function result(
  group: DerivedGroup,
  waitingOn: WaitingOn,
  reason: ReasonCode,
  reasonPr: number | null = null,
): DerivedTaskState {
  return { group, waitingOn, reason, reasonPr };
}

/** Apply the task-first state table without mutating task or thread data. */
export function deriveTaskState(input: DeriveTaskInput): DerivedTaskState {
  // Live thread facts beat the manual status: a done task whose thread is still
  // running or asking is not history, it is where you are working right now.
  const live = input.threads.filter((thread) => thread.archived !== true);
  if (live.some((thread) => thread.status === "pendingInteraction")) {
    return result("you", "you", "asking");
  }
  if (live.some((thread) => thread.status === "running")) {
    return result("running", "agent", "running");
  }
  if (input.status === "done" || input.status === "canceled") {
    return result("none", "nobody", "ended");
  }
  if (input.threads.length === 0) {
    // A never-started task is a choice to make, not an interruption; only a
    // task that claims progress without any thread evidence is stalled.
    if (input.status === "backlog" || input.status === "todo") {
      return result("backlog", "you", "notStarted");
    }
    return result("stalled", "you", "noThreads");
  }
  if (live.some((thread) => thread.status === "error")) {
    return result("you", "you", "error");
  }

  // A draft is still the agent's work in progress, so it falls through to the next/stalled rules.
  const openPullRequests = input.pullRequests.filter((pullRequest) => pullRequest.state === "open");
  const pending = openPullRequests.find((pullRequest) => pullRequest.checks === "pending");
  if (pending !== undefined) {
    return result("waiting", "ci", "ciPending", pending.number);
  }
  const failing = openPullRequests.find((pullRequest) => pullRequest.checks === "failing");
  if (failing !== undefined) {
    return result("you", "you", "ciFailed", failing.number);
  }
  if (openPullRequests.length > 0) {
    const pullRequest = openPullRequests[0]!;
    return result("you", "you", pullRequest.checks === "passing" ? "reviewPassing" : "review", pullRequest.number);
  }
  if (input.next === null) {
    return result("stalled", "you", "stalled");
  }
  return result("waiting", "agent", "waitingAgent");
}
