export type DerivedGroup = "you" | "running" | "stalled" | "waiting" | "backlog" | "none";
export type WaitingOn = "you" | "agent" | "ci" | "nobody";

export interface DerivedThread {
  status: "running" | "pendingInteraction" | "error" | "idle";
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

export interface DerivedTaskState {
  group: DerivedGroup;
  waitingOn: WaitingOn;
  reason: string;
}

function result(
  group: DerivedGroup,
  waitingOn: WaitingOn,
  reason: string,
): DerivedTaskState {
  return { group, waitingOn, reason };
}

/** Apply the task-first state table without mutating task or thread data. */
export function deriveTaskState(input: DeriveTaskInput): DerivedTaskState {
  if (input.status === "done" || input.status === "canceled") {
    return result("none", "nobody", "已结束");
  }
  if (input.threads.length === 0) {
    // A never-started task is a choice to make, not an interruption; only a
    // task that claims progress without any thread evidence is stalled.
    if (input.status === "backlog" || input.status === "todo") {
      return result("backlog", "you", "未开始");
    }
    return result("stalled", "you", "没有线程记录，写 next 或关掉");
  }
  if (input.threads.some((thread) =>
    thread.status === "pendingInteraction" || thread.status === "error"
  )) {
    return result("you", "you", "agent 在问你");
  }
  if (input.threads.some((thread) => thread.status === "running")) {
    return result("running", "agent", "agent 正在工作");
  }

  // A draft is still the agent's work in progress, so it falls through to the next/stalled rules.
  const openPullRequests = input.pullRequests.filter((pullRequest) => pullRequest.state === "open");
  const pending = openPullRequests.find((pullRequest) => pullRequest.checks === "pending");
  if (pending !== undefined) {
    return result("waiting", "ci", `PR #${pending.number} CI 运行中`);
  }
  const failing = openPullRequests.find((pullRequest) => pullRequest.checks === "failing");
  if (failing !== undefined) {
    return result("you", "you", `PR #${failing.number} CI 失败`);
  }
  if (openPullRequests.length > 0) {
    const pullRequest = openPullRequests[0]!;
    return result(
      "you",
      "you",
      pullRequest.checks === "passing"
        ? `PR #${pullRequest.number} CI 通过，等你 review`
        : `PR #${pullRequest.number} 等你 review`,
    );
  }
  if (input.next === null) {
    return result("stalled", "you", "线程停了，没有 next");
  }
  return result("waiting", "agent", "等待 agent 的下一步");
}
