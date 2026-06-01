#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [reviewPath, action, findingId, ...args] = process.argv.slice(2);

if (!reviewPath || !action || !findingId) {
  console.error(`Usage:
  node update-review.mjs <review.json> fixed <finding-id> [--commit <sha>] [--note <text>]
  node update-review.mjs <review.json> accepted-risk <finding-id> --note <text>
  node update-review.mjs <review.json> false-positive <finding-id> --note <text>
  node update-review.mjs <review.json> reopened <finding-id> [--note <text>]
  node update-review.mjs <review.json> stale <finding-id> [--note <text>]`);
  process.exit(1);
}

const allowedActions = new Set([
  "fixed",
  "accepted-risk",
  "false-positive",
  "reopened",
  "stale",
  "open",
]);

if (!allowedActions.has(action)) {
  console.error(`Unsupported action: ${action}`);
  process.exit(1);
}

const openStatuses = new Set(["open", "reopened"]);

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function inferVerdict(review) {
  const active = (review.findings ?? []).filter((candidate) => openStatuses.has(candidate.status ?? "open"));
  const critical = active.filter((candidate) => candidate.severity === "critical").length;
  const high = active.filter((candidate) => candidate.severity === "high").length;
  if (critical > 1) return "rethink";
  if (critical > 0 || high > 0) return "fix-and-ship";
  return "ship-it";
}

function summarizeAssessment(review) {
  const active = (review.findings ?? []).filter((candidate) => openStatuses.has(candidate.status ?? "open"));
  const counts = active.reduce(
    (acc, candidate) => {
      acc[candidate.severity] = (acc[candidate.severity] ?? 0) + 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );

  if (active.length === 0) return "No open findings remain.";
  return `${active.length} open finding${
    active.length === 1 ? "" : "s"
  }: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;
}

const note = option("--note");
const commit = option("--commit");
const actor = option("--by") ?? "agent";
const now = new Date().toISOString();
const review = JSON.parse(readFileSync(reviewPath, "utf8"));
const finding = [...(review.findings ?? []), ...(review.side_quests ?? [])].find(
  (candidate) => candidate.id === findingId,
);

if (!finding) {
  console.error(`Finding not found: ${findingId}`);
  process.exit(1);
}

finding.status = action === "open" ? "open" : action;
review.updated_at = now;

if (["fixed", "accepted-risk", "false-positive"].includes(action)) {
  finding.resolution = {
    status: action,
    resolved_at: now,
    resolved_by: actor,
    ...(commit ? { commit } : {}),
    ...(note ? { note } : {}),
  };
}

if (action === "reopened") {
  finding.resolution = undefined;
  finding.reopened_at = now;
  if (note) finding.reopen_note = note;
}

review.verdict = inferVerdict(review);
review.assessment = summarizeAssessment(review);
review.verdict_explanation = review.assessment;

writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

const reviewDir = dirname(reviewPath);
const eventPath = join(reviewDir, "events.jsonl");
const event = {
  ts: now,
  type: `finding.${action}`,
  finding_id: findingId,
  ...(commit ? { commit } : {}),
  ...(note ? { note } : {}),
};
appendFileSync(eventPath, `${JSON.stringify(event)}\n`);

const here = dirname(fileURLToPath(import.meta.url));
const renderScript = join(here, "render-review.mjs");

if (existsSync(renderScript)) {
  const result = spawnSync(process.execPath, [renderScript, reviewPath, reviewDir], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
