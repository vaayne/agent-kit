import type { PluginSidebarPullRequest } from "@get-bb/plugin-sdk/app";

export interface PullRequestPresentation {
  label: string;
}

/**
 * A worktree row needs one compact answer, not every CI check. BB's attention
 * is already the authoritative roll-up across checks, review, and conflicts.
 */
export function presentPullRequest(
  pullRequest: PluginSidebarPullRequest,
): PullRequestPresentation {
  switch (pullRequest.attention) {
    case "checks_failed":
      return { label: "CI failed" };
    case "checks_pending":
      return { label: "CI running" };
    case "ready_to_merge":
      return { label: "Ready" };
    case "changes_requested":
      return { label: "Changes requested" };
    case "review_requested":
      return { label: "Review requested" };
    case "conflicts":
      return { label: "Conflicts" };
    case "blocked":
      return { label: "Blocked" };
    case "draft":
      return { label: "Draft" };
    case "merged":
      return { label: "Merged" };
    case "closed":
      return { label: "Closed" };
    case "none":
      return {
        label: pullRequest.state === "open" ? "Open" : pullRequest.state,
      };
    default:
      return { label: "Open" };
  }
}
