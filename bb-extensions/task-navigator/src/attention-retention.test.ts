import { describe, expect, it } from "vitest";
import { attentionRetentionTesting } from "./attention-retention.js";

const { mergeRetention, readRetention, sameRetention } = attentionRetentionTesting;

describe("attention retention", () => {
  it("keeps the newer attention record when tabs merge", () => {
    const older = { viewedAt: 10, attentionAt: 20, expiresAt: 1_000 };
    const newer = { viewedAt: 30, attentionAt: 40, expiresAt: 900 };
    expect(mergeRetention(new Map([["thr_1", older]]), new Map([["thr_1", newer]])).get("thr_1"))
      .toEqual(newer);
  });

  it("extends equal attention with the later expiry", () => {
    const short = { viewedAt: 10, attentionAt: 20, expiresAt: 1_000 };
    const long = { viewedAt: 30, attentionAt: 20, expiresAt: 2_000 };
    expect(mergeRetention(new Map([["thr_1", short]]), new Map([["thr_1", long]])).get("thr_1"))
      .toEqual(long);
  });

  it("ignores malformed and expired local storage entries", () => {
    const future = Date.now() + 60_000;
    const parsed = readRetention(JSON.stringify({
      good: { viewedAt: 1, attentionAt: 2, expiresAt: future },
      expired: { viewedAt: 1, attentionAt: 2, expiresAt: 1 },
      malformed: { viewedAt: "now" },
    }));
    expect([...parsed.keys()]).toEqual(["good"]);
  });

  it("compares records by value instead of map identity", () => {
    const record = { viewedAt: 1, attentionAt: 2, expiresAt: 3 };
    expect(sameRetention(new Map([["thr_1", record]]), new Map([["thr_1", { ...record }]])))
      .toBe(true);
  });
});
