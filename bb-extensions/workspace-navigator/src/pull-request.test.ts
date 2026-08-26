import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { presentPullRequest } from "./pull-request.js";

function pullRequest(
  overrides: Partial<PluginSidebarPullRequest> = {},
): PluginSidebarPullRequest {
  return {
    number: 42,
    title: "Improve sidebar",
    url: "https://github.com/get-bb/bb/pull/42",
    state: "open",
    attention: "none",
    ...overrides,
  };
}

describe("presentPullRequest", () => {
  it("makes CI failures and pending checks immediately legible", () => {
    expect(
      presentPullRequest(pullRequest({ attention: "checks_failed" })),
    ).toEqual({ label: "CI failed" });
    expect(
      presentPullRequest(pullRequest({ attention: "checks_pending" })),
    ).toEqual({ label: "CI running" });
  });

  it("does not call a merely open PR successful", () => {
    expect(presentPullRequest(pullRequest())).toEqual({ label: "Open" });
  });

  it("preserves stronger non-CI attention", () => {
    expect(
      presentPullRequest(pullRequest({ attention: "changes_requested" })),
    ).toEqual({ label: "Changes requested" });
  });
});
