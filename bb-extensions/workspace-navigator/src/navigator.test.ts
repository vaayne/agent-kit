import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import {
  buildNavigator,
  canArchiveWorktree,
  ENVIRONMENT_NAME_MAX_LENGTH,
  matchesSearch,
  normalizeEnvironmentName,
  NOW_READ_RETENTION_MS,
  nowThreadReason,
  relativeUpdatedAt,
  rollupStatusFor,
  selectNowThreads,
  sessionStatusFor,
  visibleSessions,
  visibleWorktrees,
  workStatusFor,
  WORKTREES_PAGE_SIZE,
} from "./navigator.js";

function thread(
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id: "thr_1",
    projectId: "proj_1",
    title: "A session",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "pi",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: {
      id: "env_main",
      name: null,
      branchName: "main",
      workspaceDisplayKind: "other",
    },
    host: null,
    createdAt: 1,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

const projects = [{ id: "proj_1", name: "bb", isPersonal: false }];

describe("relative update time", () => {
  const now = Date.UTC(2026, 7, 24, 12, 0, 0);

  it("uses compact units at each coarse boundary", () => {
    expect(relativeUpdatedAt(now - 59_000, now)).toBe("now");
    expect(relativeUpdatedAt(now - 5 * 60_000, now)).toBe("5m");
    expect(relativeUpdatedAt(now - 2 * 60 * 60_000, now)).toBe("2h");
    expect(relativeUpdatedAt(now - 3 * 24 * 60 * 60_000, now)).toBe("3d");
    expect(relativeUpdatedAt(now - 14 * 24 * 60 * 60_000, now)).toBe("2w");
  });

  it("does not display a future timestamp as stale time", () => {
    expect(relativeUpdatedAt(now + 60_000, now)).toBe("now");
  });
});

describe("status classification", () => {
  it("includes only blocked or genuinely live work", () => {
    expect(workStatusFor(thread({ hasPendingInteraction: true }))).toBe(
      "needs-you",
    );
    expect(workStatusFor(thread({ indicator: "unread-error" }))).toBe(
      "needs-you",
    );
    expect(
      workStatusFor(
        thread({
          activity: {
            workflows: 0,
            backgroundAgents: 1,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
          },
        }),
      ),
    ).toBe("running");
  });

  it("does not treat completed unread sessions as active work", () => {
    expect(
      workStatusFor(thread({ indicator: "unread-success", isUnread: true })),
    ).toBeNull();
  });

  it("does not mistake a recent idle session for live work", () => {
    expect(workStatusFor(thread({ updatedAt: Date.now() }))).toBeNull();
  });

  it("uses one unambiguous session glyph state", () => {
    expect(sessionStatusFor(thread({ indicator: "unread-error" }))).toBe(
      "error",
    );
    expect(sessionStatusFor(thread({ hasPendingInteraction: true }))).toBe(
      "needs-you",
    );
    expect(sessionStatusFor(thread({ indicator: "unread-success" }))).toBe(
      "idle",
    );
  });
});

describe("collapsed status rollup", () => {
  it("is absent when every hidden session is idle", () => {
    expect(rollupStatusFor([thread(), thread({ id: "idle" })])).toBeNull();
  });

  it("surfaces running work when it is the strongest hidden status", () => {
    expect(
      rollupStatusFor([
        thread({
          activity: {
            workflows: 1,
            backgroundAgents: 0,
            backgroundCommands: 0,
            planMode: 0,
            goals: 0,
          },
        }),
      ]),
    ).toBe("running");
  });

  it("prioritizes error, then needs-input, regardless of session order", () => {
    const running = thread({
      id: "running",
      activity: {
        workflows: 0,
        backgroundAgents: 1,
        backgroundCommands: 0,
        planMode: 0,
        goals: 0,
      },
    });
    const needsInput = thread({
      id: "needs-input",
      hasPendingInteraction: true,
    });

    expect(rollupStatusFor([running, needsInput])).toBe("needs-you");
    expect(
      rollupStatusFor([
        needsInput,
        running,
        thread({ id: "error", indicator: "unread-error" }),
      ]),
    ).toBe("error");
  });
});

describe("navigator directory", () => {
  it("groups sessions by project then worktree and rolls urgency upward", () => {
    const result = buildNavigator(
      [
        thread({ id: "main-idle", updatedAt: 10 }),
        thread({
          id: "review-needs-you",
          environment: {
            id: "env_review",
            name: "PR 42",
            branchName: "review/42",
            workspaceDisplayKind: "managed-worktree",
          },
          indicator: "waiting-for-input",
          updatedAt: 5,
        }),
      ],
      projects,
    );

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.worktrees.map((group) => group.label)).toEqual([
      "main",
      "PR 42",
    ]);
    expect(result.projects[0]?.worktrees[1]?.workStatus).toBe("needs-you");
  });

  it("collects only actionable or running sessions in Now", () => {
    const result = buildNavigator(
      [
        thread({ id: "idle", updatedAt: 500 }),
        thread({
          id: "running",
          updatedAt: 400,
          indicator: "runtime",
        }),
        thread({
          id: "needs-input",
          updatedAt: 300,
          hasPendingInteraction: true,
        }),
        thread({
          id: "error",
          updatedAt: 200,
          indicator: "unread-error",
        }),
      ],
      projects,
    );

    expect(result.now.map((thread) => thread.id)).toEqual([
      "running",
      "needs-input",
      "error",
    ]);
  });

  it("keeps unread and recently read notifications in Now with active work", () => {
    const now = 1_000_000;
    const unread = thread({ id: "unread", updatedAt: 300, isUnread: true });
    const recentlyRead = thread({ id: "recent", updatedAt: 200 });
    const expiredRead = thread({ id: "expired", updatedAt: 100 });
    const running = thread({
      id: "running",
      updatedAt: 400,
      indicator: "runtime",
    });
    const selected = selectNowThreads(
      [unread, recentlyRead, expiredRead, running],
      new Map([
        [
          "recent",
          {
            viewedAt: now - NOW_READ_RETENTION_MS + 1,
            attentionAt: 100,
            expiresAt: now + 1,
          },
        ],
        [
          "expired",
          {
            viewedAt: now - NOW_READ_RETENTION_MS,
            attentionAt: 100,
            expiresAt: now,
          },
        ],
      ]),
      now,
    );

    expect(selected.map((thread) => thread.id)).toEqual([
      "running",
      "unread",
      "recent",
    ]);
    const retention = new Map([
      [
        "recent",
        {
          viewedAt: now - NOW_READ_RETENTION_MS + 1,
          attentionAt: 100,
          expiresAt: now + 1,
        },
      ],
    ]);
    expect(nowThreadReason(running, retention, now)).toBe("running");
    expect(nowThreadReason(unread, retention, now)).toBe("unread");
    expect(nowThreadReason(recentlyRead, retention, now)).toBe("seen");
    expect(
      nowThreadReason(
        {
          ...recentlyRead,
          latestAttentionAt: recentlyRead.latestAttentionAt + 1,
        },
        retention,
        now,
      ),
    ).toBeNull();
    expect(nowThreadReason(expiredRead, retention, now)).toBeNull();
  });

  it("keeps freshly running work visible ahead of older notifications", () => {
    const running = thread({
      id: "running",
      updatedAt: 1_000,
      latestAttentionAt: 100,
      indicator: "runtime",
    });
    const unread = thread({
      id: "unread",
      updatedAt: 500,
      latestAttentionAt: 600,
      isUnread: true,
    });

    expect(selectNowThreads([unread, running], new Map(), 2_000)).toEqual([
      running,
      unread,
    ]);
  });

  it("keeps the main branch and plain checkout above newer worktrees", () => {
    const result = buildNavigator(
      [
        thread({
          id: "feature-newest",
          updatedAt: 300,
          environment: {
            id: "env_feature",
            name: null,
            branchName: "feature/newest",
            workspaceDisplayKind: "managed-worktree",
          },
        }),
        thread({
          id: "plain-checkout",
          updatedAt: 200,
          environment: {
            id: "env_plain",
            name: null,
            branchName: "release",
            workspaceDisplayKind: "other",
          },
        }),
        thread({
          id: "main-oldest",
          updatedAt: 100,
          environment: {
            id: "env_main",
            name: null,
            branchName: "MAIN",
            workspaceDisplayKind: "managed-worktree",
          },
        }),
      ],
      projects,
    );

    expect(
      result.projects[0]?.worktrees.map((worktree) => worktree.label),
    ).toEqual(["MAIN", "release", "feature/newest"]);
  });

  it("preserves BB's project order instead of reordering by activity", () => {
    const result = buildNavigator(
      [
        thread({
          id: "second-project-newer",
          projectId: "second",
          updatedAt: 1000,
        }),
        thread({ id: "first-project-older", projectId: "first", updatedAt: 1 }),
      ],
      [
        { id: "first", name: "first", isPersonal: false },
        { id: "second", name: "second", isPersonal: false },
      ],
    );
    expect(result.projects.map((project) => project.id)).toEqual([
      "first",
      "second",
    ]);
  });

  it("offers worktree archive only for worktree-backed environments", () => {
    const ordinary = buildNavigator([thread()], projects).projects[0]
      ?.worktrees[0];
    const managed = buildNavigator(
      [
        thread({
          environment: {
            id: "env_managed",
            name: null,
            branchName: "feature/archive",
            workspaceDisplayKind: "managed-worktree",
          },
        }),
      ],
      projects,
    ).projects[0]?.worktrees[0];
    const external = buildNavigator(
      [
        thread({
          environment: {
            id: "env_external",
            name: null,
            branchName: "feature/external",
            workspaceDisplayKind: "unmanaged-worktree",
          },
        }),
      ],
      projects,
    ).projects[0]?.worktrees[0];
    if (!ordinary || !managed || !external) {
      throw new Error("Expected worktree groups");
    }
    expect(canArchiveWorktree(ordinary)).toBe(false);
    expect(canArchiveWorktree(managed)).toBe(true);
    expect(canArchiveWorktree(external)).toBe(true);
  });

  it("uses a projectless bucket instead of merging session-only threads", () => {
    const result = buildNavigator([thread({ environment: null })], projects);
    expect(result.projects[0]?.worktrees[0]?.label).toBe("No workspace");
  });

  it("disambiguates different worktrees on the same branch", () => {
    const result = buildNavigator(
      [
        thread({
          environment: {
            id: "env_original",
            name: null,
            branchName: "main",
            workspaceDisplayKind: "other",
          },
        }),
        thread({
          id: "cow",
          environment: {
            id: "env_cow",
            name: null,
            branchName: "main",
            workspaceDisplayKind: "other",
          },
        }),
      ],
      projects,
    );
    expect(
      result.projects[0]?.worktrees.map((worktree) => worktree.label),
    ).toEqual(["main · env_cow", "main · env_origin…"]);
  });

  it("shows worktrees in fixed pages without reordering them", () => {
    const result = buildNavigator(
      Array.from({ length: 6 }, (_, index) =>
        thread({
          id: `thread-${index}`,
          updatedAt: 100 - index,
          environment: {
            id: `env_${index}`,
            name: null,
            branchName: `branch-${index}`,
            workspaceDisplayKind: "managed-worktree",
          },
        })),
      projects,
    );
    const worktrees = result.projects[0]?.worktrees ?? [];
    expect(visibleWorktrees(worktrees, WORKTREES_PAGE_SIZE)).toHaveLength(5);
    expect(
      visibleWorktrees(worktrees, 10).map((worktree) => worktree.label),
    ).toEqual(worktrees.map((worktree) => worktree.label));
  });

  it("shows sessions in fixed pages without reordering them", () => {
    const sessions = Array.from(
      { length: 6 },
      (_, index) => thread({ id: `session-${index}`, updatedAt: 100 - index }),
    );
    expect(visibleSessions(sessions, WORKTREES_PAGE_SIZE)).toHaveLength(5);
    expect(visibleSessions(sessions, 10).map((thread) => thread.id)).toEqual(
      sessions.map((thread) => thread.id),
    );
  });

  it("promotes action-required sessions into the first page", () => {
    const sessions = [
      ...Array.from({ length: 5 }, (_, index) => thread({ id: `recent-${index}`, updatedAt: 100 - index })),
      thread({ id: "blocked", updatedAt: 1, hasPendingInteraction: true }),
    ];
    expect(visibleSessions(sessions, WORKTREES_PAGE_SIZE)[0]?.id).toBe(
      "blocked",
    );
  });

  it("promotes running sessions and worktrees ahead of idle history", () => {
    const running = thread({
      id: "running",
      updatedAt: 1,
      activity: {
        workflows: 1,
        backgroundAgents: 0,
        backgroundCommands: 0,
        planMode: 0,
        goals: 0,
      },
      environment: {
        id: "env_running",
        name: null,
        branchName: "running-worktree",
        workspaceDisplayKind: "managed-worktree",
      },
    });
    const idle = Array.from({ length: 5 }, (_, index) =>
      thread({
        id: `idle-${index}`,
        updatedAt: 100 - index,
        environment: {
          id: `env_idle_${index}`,
          name: null,
          branchName: `idle-${index}`,
          workspaceDisplayKind: "managed-worktree",
        },
      }));

    expect(
      visibleSessions([...idle, running], WORKTREES_PAGE_SIZE)[0]?.id,
    ).toBe("running");
    const worktrees = buildNavigator([...idle, running], projects).projects[0]
      ?.worktrees;
    if (!worktrees) throw new Error("Expected worktrees");
    expect(visibleWorktrees(worktrees, WORKTREES_PAGE_SIZE)[0]?.label).toBe(
      "running-worktree",
    );
  });

  it("keeps main above recent worktrees and surfaces pinned sessions separately", () => {
    const result = buildNavigator(
      [
        thread({ id: "older", updatedAt: 10 }),
        thread({
          id: "newer-pinned",
          updatedAt: 20,
          isPinned: true,
          environment: {
            id: "env_newer",
            name: null,
            branchName: "newer",
            workspaceDisplayKind: "managed-worktree",
          },
        }),
      ],
      projects,
    );
    expect(
      result.projects[0]?.worktrees.map((worktree) => worktree.label),
    ).toEqual(["main", "newer"]);
    expect(result.pinned[0]?.threads.map((thread) => thread.id)).toEqual([
      "newer-pinned",
    ]);
  });
});

describe("environment rename normalization", () => {
  it("trims names, clears only existing custom names, and enforces the server limit", () => {
    expect(normalizeEnvironmentName("  Review workspace  ", null)).toEqual({
      name: "Review workspace",
      error: null,
    });
    expect(normalizeEnvironmentName("   ", "Review workspace")).toEqual({
      name: null,
      error: null,
    });
    expect(normalizeEnvironmentName("   ", null)).toEqual({
      name: null,
      error: "Environment name is required.",
    });
    expect(
      normalizeEnvironmentName(
        "a".repeat(ENVIRONMENT_NAME_MAX_LENGTH + 1),
        null,
      ),
    ).toEqual({
      name: null,
      error: `Environment name must be ${ENVIRONMENT_NAME_MAX_LENGTH} characters or fewer.`,
    });
  });
});

describe("search", () => {
  it("finds a session by its title, project, or worktree", () => {
    const session = thread({
      title: "Repair sidebar",
      environment: {
        id: "env_1",
        name: null,
        branchName: "feat/sidebar",
        workspaceDisplayKind: "managed-worktree",
      },
    });
    expect(matchesSearch(session, "repair", "bb")).toBe(true);
    expect(matchesSearch(session, "sidebar", "bb")).toBe(true);
    expect(matchesSearch(session, "bb", "bb")).toBe(true);
    expect(matchesSearch(session, "unrelated", "bb")).toBe(false);
  });
});
