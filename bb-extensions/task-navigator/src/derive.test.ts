import { describe, expect, it } from "vitest";
import { deriveTaskState, type DerivedThread } from "./derive.js";

const idle: DerivedThread = { status: "idle" };

describe("deriveTaskState", () => {
  it("keeps manual terminal states out of active groups", () => {
    expect(deriveTaskState({ status: "done", threads: [], pullRequests: [], next: null }))
      .toEqual({ group: "none", waitingOn: "nobody", reason: "ended", reasonPr: null });
  });

  it("keeps a never-started task out of your queue", () => {
    expect(deriveTaskState({ status: "todo", threads: [], pullRequests: [], next: null }))
      .toMatchObject({ group: "backlog", waitingOn: "you", reason: "notStarted" });
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
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "asking" });
  });

  it("ignores archived errored attempts", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [{ status: "error", archived: true }, idle],
      pullRequests: [],
      next: null,
    })).toMatchObject({ group: "stalled", reason: "stalled" });
  });

  it("flags a live errored thread without calling it a question", () => {
    expect(deriveTaskState({ status: "in_progress", threads: [{ status: "error" }], pullRequests: [], next: "x" }))
      .toMatchObject({ group: "you", reason: "error" });
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
    })).toMatchObject({ group: "waiting", waitingOn: "ci", reason: "ciPending", reasonPr: 12 });
  });

  it("puts a green open PR in your queue", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "passing" }],
      next: "continue",
    })).toMatchObject({ group: "you", waitingOn: "you", reason: "reviewPassing", reasonPr: 12 });
  });

  it("never reports a failing PR as passing", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "failing" }],
      next: "continue",
    })).toMatchObject({ group: "you", reason: "ciFailed", reasonPr: 12 });
  });

  it("asks for review without claiming CI when a PR has no checks", () => {
    expect(deriveTaskState({
      status: "in_review",
      threads: [idle],
      pullRequests: [{ number: 12, state: "open", checks: "no_checks" }],
      next: "continue",
    })).toMatchObject({ group: "you", reason: "review", reasonPr: 12 });
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
      .toMatchObject({ group: "stalled", waitingOn: "you", reason: "stalled" });
  });

  it("waits on the agent when an explicit next step exists", () => {
    expect(deriveTaskState({ status: "in_progress", threads: [idle], pullRequests: [], next: "run tests" }))
      .toMatchObject({ group: "waiting", waitingOn: "agent" });
  });

  it("keeps a done task in Now while one of its threads still runs", () => {
    expect(deriveTaskState({
      status: "done",
      threads: [{ status: "running" }, { status: "idle", archived: true }],
      pullRequests: [],
      next: null,
    })).toMatchObject({ group: "running", reason: "running" });
  });

  it("treats a done task with only idle threads as ended", () => {
    expect(deriveTaskState({ status: "done", threads: [{ status: "idle" }], pullRequests: [], next: null }))
      .toMatchObject({ group: "none", reason: "ended" });
  });
});
