import { describe, expect, it } from "vitest";
import { deriveTaskState, type DerivedThread } from "./derive.js";

const idle: DerivedThread = { status: "idle" };

describe("deriveTaskState", () => {
  it("keeps manual terminal states out of active groups", () => {
    expect(deriveTaskState({ status: "done", threads: [], pullRequests: [], next: null }))
      .toEqual({ group: "none", waitingOn: "nobody", reason: "已结束" });
  });

  it("puts a task without threads in your queue", () => {
    expect(deriveTaskState({ status: "todo", threads: [], pullRequests: [], next: null }).group)
      .toBe("you");
  });

  it("prioritizes blocked and failed threads", () => {
    expect(deriveTaskState({
      status: "in_progress",
      threads: [{ status: "pendingInteraction" }, idle],
      pullRequests: [],
      next: "continue",
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "agent 在问你" });
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

  it("puts a reviewed open PR in your queue", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "complete" }],
      next: "continue",
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "PR #12 CI 通过，等你 review" });
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
