import { describe, expect, it } from "vitest";
import { deriveTaskState, type DerivedThread } from "./derive.js";

const idle: DerivedThread = { status: "idle" };

describe("deriveTaskState", () => {
  it("keeps manual terminal states out of active groups", () => {
    expect(deriveTaskState({ status: "done", threads: [], pullRequests: [], next: null }))
      .toEqual({ group: "none", waitingOn: "nobody", reason: "已结束" });
  });

  it("keeps a never-started task out of your queue", () => {
    expect(deriveTaskState({ status: "todo", threads: [], pullRequests: [], next: null }))
      .toMatchObject({ group: "backlog", waitingOn: "you", reason: "未开始" });
  });

  it("treats claimed progress without any thread as stalled", () => {
    expect(deriveTaskState({ status: "in_review", threads: [], pullRequests: [], next: null }).group)
      .toBe("stalled");
  });

  it("prioritizes blocked and failed threads", () => {
    expect(deriveTaskState({
      status: "in_progress",
      threads: [{ status: "pendingInteraction" }, idle],
      pullRequests: [],
      next: "continue",
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "agent 在问你" });
  });

  it("ignores archived errored attempts", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [{ status: "error", archived: true }, idle],
      pullRequests: [],
      next: null,
    })).toMatchObject({ group: "stalled", reason: "线程停了，没有 next" });
  });

  it("flags a live errored thread without calling it a question", () => {
    expect(deriveTaskState({ status: "in_progress", threads: [{ status: "error" }], pullRequests: [], next: "x" }))
      .toMatchObject({ group: "you", reason: "线程出错了，看一眼或归档它" });
  });

  it("prioritizes running threads over pull requests", () => {
    expect(deriveTaskState({
      status: "in_progress",
      threads: [{ status: "running" }],
      pullRequests: [{ number: 1, state: "open", checks: "pending" }],
      next: "continue",
    }).group).toBe("running");
  });

  it("waits on CI for an open PR with pending checks", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "pending" }],
      next: "continue",
    })).toMatchObject({ group: "waiting", waitingOn: "ci", reason: "PR #12 CI 运行中" });
  });

  it("puts a green open PR in your queue", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "passing" }],
      next: "continue",
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "PR #12 CI 通过，等你 review" });
  });

  it("never reports a failing PR as passing", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "failing" }],
      next: "continue",
    })).toMatchObject({ group: "you", reason: "PR #12 CI 失败" });
  });

  it("asks for review without claiming CI when a PR has no checks", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "no_checks" }],
      next: "continue",
    })).toMatchObject({ group: "you", reason: "PR #12 等你 review" });
  });

  it("treats a draft PR as unfinished agent work", () => {
    expect(deriveTaskState({
      status: "in_progress",
      threads: [idle],
      pullRequests: [{ number: 12, state: "draft", checks: "passing" }],
      next: "finish the PR",
    })).toMatchObject({ group: "waiting", waitingOn: "agent" });
  });

  it("calls out stopped work without a next step", () => {
    expect(deriveTaskState({ status: "in_review", threads: [idle], pullRequests: [], next: null }))
      .toMatchObject({ group: "stalled", waitingOn: "you", reason: "线程停了，没有 next" });
  });

  it("waits on the agent when an explicit next step exists", () => {
    expect(deriveTaskState({ status: "in_progress", threads: [idle], pullRequests: [], next: "run tests" }))
      .toMatchObject({ group: "waiting", waitingOn: "agent" });
  });
});
