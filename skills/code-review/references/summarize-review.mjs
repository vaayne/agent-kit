#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node summarize-review.mjs <review.json> <summary.md>");
  process.exit(1);
}

const review = JSON.parse(readFileSync(inputPath, "utf8"));
const findings = Array.isArray(review.findings) ? review.findings : [];
const sideQuests = Array.isArray(review.side_quests) ? review.side_quests : [];
const openStatuses = new Set(["open", "reopened"]);
const severityOrder = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
]);

function compareFindings(a, b) {
  return (
    (severityOrder.get(a.severity) ?? 99)
      - (severityOrder.get(b.severity) ?? 99)
    || String(a.id).localeCompare(String(b.id))
  );
}

function titleCase(value) {
  return String(value ?? "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function location(finding) {
  const file = finding.file ?? "unknown";
  const start = finding.line_start ?? finding.line ?? "?";
  const end = finding.line_end && finding.line_end !== start ? `-${finding.line_end}` : "";
  return `${file}:${start}${end}`;
}

function renderFinding(finding) {
  const lines = [
    `### ${finding.id} ${finding.severity} ${finding.category} — ${finding.title}`,
    `- File: ${location(finding)}`,
    `- Status: ${finding.status ?? "open"}`,
    `- Confidence: ${finding.confidence ?? "unknown"}`,
    `- Issue: ${finding.description ?? ""}`,
  ];

  if (finding.impact) lines.push(`- Impact: ${finding.impact}`);
  if (finding.suggestion) lines.push(`- Fix: ${finding.suggestion}`);
  if (finding.resolution?.note) lines.push(`- Resolution: ${finding.resolution.note}`);
  return lines.join("\n");
}

const openFindings = findings.filter((finding) => openStatuses.has(finding.status ?? "open"));
const closedFindings = findings.filter(
  (finding) => !openStatuses.has(finding.status ?? "open"),
);
const counts = findings.reduce(
  (acc, finding) => {
    const severity = finding.severity ?? "low";
    acc[severity] = (acc[severity] ?? 0) + 1;
    return acc;
  },
  { critical: 0, high: 0, medium: 0, low: 0 },
);

const lines = [
  `# Code Review Summary`,
  "",
  `- Review: ${review.review_id ?? "unknown"}`,
  `- Project: ${review.project ?? "unknown"}`,
  `- Branch: ${review.branch ?? "unknown"}`,
  `- Base: ${review.base ?? "unknown"}`,
  `- Verdict: ${titleCase(review.verdict ?? "unknown")}`,
  `- Findings: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low`,
  "",
  review.assessment ?? "",
  "",
  "## Open Findings",
  "",
];

if (openFindings.length === 0) {
  lines.push("No open findings.");
} else {
  lines.push(...openFindings.sort(compareFindings).map(renderFinding).join("\n\n").split("\n"));
}

if (sideQuests.length > 0) {
  lines.push("", "## Side Quests", "");
  lines.push(...sideQuests.sort(compareFindings).map(renderFinding).join("\n\n").split("\n"));
}

if (closedFindings.length > 0) {
  lines.push("", "## Closed Findings", "");
  lines.push(...closedFindings.sort(compareFindings).map(renderFinding).join("\n\n").split("\n"));
}

writeFileSync(outputPath, `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`);
