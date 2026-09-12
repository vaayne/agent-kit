import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { effectiveVerdict, inferVerdict, summarizeAssessment } from "./review-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const updateScript = join(here, "update-review.mjs");
const renderScript = join(here, "render-review.mjs");

function baseReview(overrides = {}) {
  return {
    schema_version: 1,
    review_id: "test",
    project: "agent-kit",
    branch: "feature/x",
    base: "main",
    findings: [],
    ...overrides,
  };
}

const openFinding = {
  id: "CR-001",
  fingerprint: "bug|src/a.ts|x|y",
  severity: "medium",
  category: "bug",
  title: "Something",
  file: "src/a.ts",
  status: "open",
};

const doubt = {
  fingerprint: "correctness|src/q.ts|double-enqueue|retry-path",
  category: "correctness",
  file: "src/q.ts",
  severity: "high",
  title: "Possible double enqueue on retry",
  reason: "Retry path could not be traced end to end.",
};

function tmpBundle(t, review) {
  const dir = mkdtempSync(join(tmpdir(), "review-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reviewPath = join(dir, "review.json");
  writeFileSync(reviewPath, JSON.stringify(review, null, 2));
  return { dir, reviewPath };
}

function render(t, review) {
  const { dir, reviewPath } = tmpBundle(t, review);
  execFileSync(process.execPath, [renderScript, reviewPath, dir], { stdio: "pipe" });
  return {
    html: readFileSync(join(dir, "report.html"), "utf8"),
    md: readFileSync(join(dir, "summary.md"), "utf8"),
  };
}

function runUpdate(t, review, ...args) {
  const { dir, reviewPath } = tmpBundle(t, review);
  execFileSync(process.execPath, [updateScript, reviewPath, ...args], { stdio: "pipe" });
  return { dir, review: JSON.parse(readFileSync(reviewPath, "utf8")) };
}

describe("inferVerdict", () => {
  test("any open finding blocks ship-it, including medium/low", () => {
    const review = baseReview({
      findings: [openFinding],
      verification: { complete: true, limitations: [] },
    });
    assert.equal(inferVerdict(review), "fix-and-ship");
  });

  test("unresolved doubts block ship-it", () => {
    const review = baseReview({
      verification: { complete: true, limitations: [] },
      unresolved: [doubt],
    });
    assert.equal(inferVerdict(review), "needs-review");
  });

  test("incomplete verification blocks ship-it even with zero findings", () => {
    const review = baseReview({
      verification: { complete: false, limitations: ["no load test"] },
    });
    assert.equal(inferVerdict(review), "needs-review");
  });

  test("complete verification with no findings or doubts ships", () => {
    const review = baseReview({ verification: { complete: true, limitations: [] } });
    assert.equal(inferVerdict(review), "ship-it");
  });

  test("legacy bundle without new fields never auto-passes", () => {
    assert.equal(inferVerdict(baseReview()), "needs-review");
  });

  test("multiple open criticals mean rethink", () => {
    const critical = { ...openFinding, severity: "critical" };
    const review = baseReview({
      findings: [critical, { ...critical, id: "CR-002" }],
      verification: { complete: true },
    });
    assert.equal(inferVerdict(review), "rethink");
  });
});

describe("effectiveVerdict", () => {
  test("explicit legacy ship-it cannot override unresolved doubts", () => {
    assert.equal(effectiveVerdict(baseReview({ verdict: "ship-it", unresolved: [doubt] })), "needs-review");
  });

  test("explicit ship-it cannot override missing verification", () => {
    assert.equal(effectiveVerdict(baseReview({ verdict: "ship-it" })), "needs-review");
  });

  test("explicit ship-it stands when verification completed clean", () => {
    const review = baseReview({
      verdict: "ship-it",
      verification: { complete: true, limitations: [] },
    });
    assert.equal(effectiveVerdict(review), "ship-it");
  });

  test("stored non-pass verdicts stay as recorded", () => {
    const review = baseReview({ verdict: "fix-and-ship", findings: [openFinding] });
    assert.equal(effectiveVerdict(review), "fix-and-ship");
  });
});

describe("summarizeAssessment", () => {
  test("reports unresolved doubts and missing verification", () => {
    const text = summarizeAssessment(baseReview({ unresolved: [doubt] }));
    assert.match(text, /1 unresolved doubt/);
    assert.match(text, /not recorded|incomplete/);
  });
});

describe("update-review.mjs integration", () => {
  test("fixing the last finding does not flip incomplete verification to pass", (t) => {
    const { review } = runUpdate(
      t,
      baseReview({
        findings: [openFinding],
        verification: { complete: false, limitations: ["no edge-case coverage"] },
        unresolved: [doubt],
      }),
      "fixed",
      "CR-001",
      "--note",
      "done",
    );
    assert.equal(review.findings[0].status, "fixed");
    assert.equal(review.verdict, "needs-review");
    assert.equal(review.unresolved.length, 1);
    assert.equal(review.verification.complete, false);
    assert.deepEqual(review.verification.limitations, ["no edge-case coverage"]);
  });

  test("human assessment and verdict_explanation are preserved; summary goes to auto_assessment", (t) => {
    const { review } = runUpdate(
      t,
      baseReview({
        findings: [openFinding],
        assessment: "Human note: the retry path still worries me.",
        verdict_explanation: "We shipped cautiously because of the retry path.",
      }),
      "fixed",
      "CR-001",
    );
    assert.equal(review.assessment, "Human note: the retry path still worries me.");
    assert.equal(review.verdict_explanation, "We shipped cautiously because of the retry path.");
    assert.match(review.auto_assessment, /No open findings remain/);
    assert.equal(review.verdict, "needs-review");
  });

  test("a recorded non-pass verdict survives a status update", (t) => {
    const { review } = runUpdate(
      t,
      baseReview({
        verdict: "rethink",
        findings: [openFinding],
        verification: { complete: true, limitations: [] },
      }),
      "fixed",
      "CR-001",
    );
    assert.equal(review.verdict, "rethink");
    assert.match(review.auto_assessment, /No open findings remain/);
  });
});

describe("render-review.mjs output", () => {
  test("truly empty findings render without a clean-bill claim", (t) => {
    const { html, md } = render(t, baseReview({ verification: { complete: false } }));
    assert.ok(!html.includes("Clean bill of health"));
    assert.match(html, /Needs review/);
    assert.match(html, /Verification incomplete|Verification not recorded/);
    assert.match(md, /Verdict: Needs Review/);
  });

  test("complete verification still shows non-blocking limitations in HTML and Markdown", (t) => {
    const { html, md } = render(
      t,
      baseReview({ verification: { complete: true, limitations: ["integration env untouched"] } }),
    );
    assert.match(html, /Ship it/);
    assert.match(html, /integration env untouched/);
    assert.match(md, /Verification limits: integration env untouched/);
  });

  test("unresolved and dismissed render in HTML and Markdown; free text is escaped in both", (t) => {
    const { html, md } = render(
      t,
      baseReview({
        unresolved: [{ ...doubt, title: "Inject <script>alert(1)</script> doubt" }],
        dismissed: [
          {
            fingerprint: "f",
            category: "bug",
            file: "src/b.ts",
            title: "Old claim",
            reason: "Refuted at src/b.ts:10.",
          },
        ],
      }),
    );
    assert.match(html, /Unresolved Doubts/);
    assert.match(html, /Dismissed in Verification/);
    assert.ok(html.includes("Inject &lt;script&gt;"));
    assert.match(md, /## Unresolved Doubts/);
    assert.match(md, /## Dismissed in Verification/);
    assert.ok(md.includes("&lt;script&gt;"));
    assert.ok(!md.includes("<script>alert(1)</script>"));
  });
});
