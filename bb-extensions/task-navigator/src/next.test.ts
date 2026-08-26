import { describe, expect, it } from "vitest";
import { parseNext } from "./next.js";

describe("parseNext", () => {
  it("uses the latest English Next marker", () => {
    expect(parseNext([
      { body: "Next: old", createdAt: "2026-08-26T10:00:00Z" },
      { body: "Next: write tests\nMore detail", createdAt: "2026-08-26T11:00:00Z" },
    ])).toEqual({ next: "write tests", lastNextAt: Date.parse("2026-08-26T11:00:00Z") });
  });

  it("accepts Chinese punctuation and treats none as empty", () => {
    expect(parseNext([
      { body: "Next：继续验证", createdAt: "2026-08-26T10:00:00Z" },
      { body: "  next: none  ", createdAt: "2026-08-26T11:00:00Z" },
    ])).toEqual({ next: null, lastNextAt: Date.parse("2026-08-26T11:00:00Z") });
  });

  it("ignores markers after the first line", () => {
    expect(parseNext([
      { body: "Result\nNext: not a marker", createdAt: "2026-08-26T10:00:00Z" },
    ])).toEqual({ next: null, lastNextAt: null });
  });
});
