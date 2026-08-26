export type DerivedGroup = "you" | "running" | "stalled" | "waiting" | "none";
export type WaitingOn = "you" | "agent" | "ci" | "nobody";

export interface DerivedThread {
  status: "running" | "pendingInteraction" | "error" | "idle";
}

export interface DerivedPullRequest {
  number: number;
  state: "open" | "draft" | "merged" | "closed";
  checks: "pending" | "complete";
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
    return result("you", "you", "还没有线程，等你开始");
  }
  if (input.threads.some((thread) =>
    thread.status === "pendingInteraction" || thread.status === "error"
  )) {
    return result("you", "you", "agent 在问你");
  }
  if (input.threads.some((thread) => thread.status === "running")) {
    return result("running", "agent", "agent 正在工作");
  }

  const openPullRequests = input.pullRequests.filter((pullRequest) =>
    pullRequest.state === "open" || pullRequest.state === "draft"
  );
  if (openPullRequests.some((pullRequest) => pullRequest.checks === "pending")) {
    const pullRequest = openPullRequests.find((candidate) =>
      candidate.checks === "pending"
    );
    return result(
      "waiting",
      "ci",
      `PR #${pullRequest?.number ?? "?"} CI 运行中`,
    );
  }
  if (openPullRequests.length > 0) {
    const pullRequest = openPullRequests[0]!;
    return result(
      "you",
      "you",
      `PR #${pullRequest.number} CI 通过，等你 review`,
    );
  }
  if (input.next === null) {
    return result("stalled", "you", "线程停了，没有 next");
  }
  return result("waiting", "agent", "等待 agent 的下一步");
}
