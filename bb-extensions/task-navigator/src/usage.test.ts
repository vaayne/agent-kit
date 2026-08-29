import { describe, expect, it } from "vitest";
import {
  describeUsageBody,
  formatUsageReset,
  formatUsageSummary,
  nearestResetUsageWindow,
  usageBarTone,
  usageProviderConfig,
  type UsageResponse,
  usageSummary,
  usageWindowValue,
  visibleUsageProviders,
} from "./usage.js";

const usage: UsageResponse = {
  codex: {
    status: "ok",
    planLabel: "Plus",
    windows: [{ label: "5 hour", usedPercent: 15, resetsAt: null }],
  },
  "claude-code": {
    status: "ok",
    planLabel: "Pro",
    windows: [
      { label: "Session", usedPercent: 44, resetsAt: null },
      { label: "Weekly", usedPercent: 77, resetsAt: null },
    ],
  },
  cursor: {
    status: "ok",
    planLabel: null,
    windows: [{ label: "Monthly", usedPercent: 92, resetsAt: null }],
  },
};

describe("usage summary", () => {
  it("ranks providers by their next-reset window and keeps only two", () => {
    const summary = usageSummary(usage);
    expect(summary.items).toEqual([
      { id: "cursor", name: "Cursor", usedPercent: 92 },
      { id: "claude-code", name: "Claude", usedPercent: 44 },
    ]);
    expect(summary.hiddenProviderCount).toBe(1);
    expect(formatUsageSummary(summary)).toBe("Cursor 92% · Claude 44% · +1");
  });

  it("omits providers without authenticated usage windows", () => {
    const unavailable: UsageResponse = {
      ...usage,
      codex: { status: "unauthenticated" },
      "claude-code": { status: "ok", planLabel: null, windows: [] },
      cursor: { status: "not_installed" },
    };
    expect(usageSummary(unavailable)).toEqual({
      items: [],
      hiddenProviderCount: 0,
    });
    expect(formatUsageSummary(usageSummary(unavailable))).toBeNull();
  });

  it("reports whichever providers bb sent, including ones it does not know", () => {
    const partial: UsageResponse = {
      "claude-code": {
        status: "ok",
        planLabel: "Max (5x)",
        windows: [{ label: "Session", usedPercent: 27, resetsAt: null }],
      },
      "acme-agent": {
        status: "ok",
        planLabel: null,
        windows: [{ label: "Monthly", usedPercent: 61, resetsAt: null }],
      },
    };
    expect(usageSummary(partial).items).toEqual([
      { id: "acme-agent", name: "Acme Agent", usedPercent: 61 },
      { id: "claude-code", name: "Claude", usedPercent: 27 },
    ]);
    expect(
      visibleUsageProviders(partial).map((entry) => entry.config.id),
    ).toEqual(["claude-code", "acme-agent"]);
    expect(
      describeUsageBody({
        config: usageProviderConfig("acme-agent"),
        usage: { status: "unauthenticated" },
        isLoading: false,
      }),
    ).toEqual({
      kind: "message",
      text: "Sign in to Acme Agent to see your usage.",
    });
  });
});

describe("usage presentation", () => {
  it("selects the next-reset limit only for the summary", () => {
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    const fiveHour = {
      label: "5-hour limit",
      usedPercent: 44,
      resetsAt: new Date(now + 2 * 60 * 60_000).toISOString(),
    };
    const weekly = {
      label: "Weekly limit",
      usedPercent: 77,
      resetsAt: new Date(now + 5 * 24 * 60 * 60_000).toISOString(),
    };
    const usageWithResets: UsageResponse = {
      ...usage,
      "claude-code": {
        status: "ok",
        planLabel: "Pro",
        windows: [weekly, fiveHour],
      },
    };

    expect(nearestResetUsageWindow([weekly, fiveHour], now)).toBe(fiveHour);
    expect(
      nearestResetUsageWindow([{ ...weekly, resetsAt: "bad" }, fiveHour], now),
    ).toBe(fiveHour);
    expect(
      nearestResetUsageWindow([{ ...weekly, resetsAt: null }, fiveHour], now),
    ).toBe(fiveHour);
    expect(
      nearestResetUsageWindow(
        [
          { ...weekly, resetsAt: null },
          { ...fiveHour, resetsAt: null },
        ],
        now,
      ),
    ).toEqual({ ...weekly, resetsAt: null });
    expect(
      describeUsageBody({
        config: usageProviderConfig("claude-code"),
        usage: usageWithResets["claude-code"],
        isLoading: false,
      }),
    ).toEqual({ kind: "windows", windows: [weekly, fiveHour] });
    expect(usageSummary(usageWithResets, now).items).toContainEqual({
      id: "claude-code",
      name: "Claude",
      usedPercent: 44,
    });
  });

  it("uses warning and destructive thresholds on used capacity", () => {
    expect(usageBarTone(79)).toBe("muted");
    expect(usageBarTone(80)).toBe("warning");
    expect(usageBarTone(94)).toBe("warning");
    expect(usageBarTone(95)).toBe("destructive");
  });

  it("formats reset boundaries without inventing a date", () => {
    const now = Date.UTC(2026, 7, 24, 12, 0, 0);
    expect(formatUsageReset(null, now)).toBeNull();
    expect(formatUsageReset("not-a-date", now)).toBeNull();
    expect(formatUsageReset(new Date(now).toISOString(), now)).toBe(
      "Resetting now",
    );
    expect(formatUsageReset(new Date(now + 59_000).toISOString(), now)).toBe(
      "Resets in 1m",
    );
    expect(
      formatUsageReset(new Date(now + 60 * 60_000).toISOString(), now),
    ).toBe("Resets in 1h");
    expect(
      formatUsageReset(new Date(now + 61 * 60_000).toISOString(), now),
    ).toBe("Resets in 1h 1m");
    expect(
      formatUsageReset(new Date(now + 24 * 60 * 60_000).toISOString(), now),
    ).toBe("Resets in 1d");
  });

  it("formats ordinary and Cursor cost windows", () => {
    expect(
      usageWindowValue({ label: "Weekly", usedPercent: 42, resetsAt: null }),
    ).toBe("42% used");
    expect(
      usageWindowValue({
        label: "Monthly spend",
        usedPercent: 15,
        resetsAt: null,
        cost: { usedUsdCents: 150, limitUsdCents: 2_000 },
      }),
    ).toBe("$1.50 / $20");
  });

  it("hides absent CLIs and gives each available status useful copy", () => {
    const codex = usageProviderConfig("codex");
    expect(
      visibleUsageProviders({ ...usage, cursor: { status: "not_installed" } }),
    ).toHaveLength(2);
    expect(
      describeUsageBody({
        config: codex,
        usage: { status: "unauthenticated" },
        isLoading: false,
      }),
    ).toEqual({ kind: "message", text: codex.signInHint });
    expect(
      describeUsageBody({
        config: codex,
        usage: { status: "expired" },
        isLoading: false,
      }),
    ).toEqual({ kind: "message", text: codex.expiredHint });
    expect(
      describeUsageBody({
        config: codex,
        usage: { status: "error", message: "Rate limited", planLabel: null },
        isLoading: false,
      }),
    ).toEqual({ kind: "message", text: "Rate limited" });
    expect(
      describeUsageBody({
        config: codex,
        usage: { status: "not_installed" },
        isLoading: false,
      }),
    ).toEqual({ kind: "none" });
  });
});
