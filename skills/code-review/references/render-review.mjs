#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [inputPath, outputDir] = process.argv.slice(2);

if (!inputPath || !outputDir) {
  console.error("Usage: node render-review.mjs <review.json> <output-dir>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "report-template.html");
const template = readFileSync(templatePath, "utf8");
const review = JSON.parse(readFileSync(inputPath, "utf8"));

const severities = ["critical", "high", "medium", "low"];
const openStatuses = new Set(["open", "reopened"]);
const severityOrder = new Map(severities.map((severity, index) => [severity, index]));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleCase(value) {
  const normalized = String(value ?? "").replace(/-/g, " ");
  const lowerWords = new Set(["and", "or", "the", "a", "an", "it"]);
  return normalized
    .split(" ")
    .map((word, index) => {
      if (index > 0 && lowerWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function lineRef(finding) {
  const start = finding.line_start ?? finding.line ?? "?";
  const end = finding.line_end && finding.line_end !== start ? `-${finding.line_end}` : "";
  return `${start}${end}`;
}

function location(finding) {
  return `${finding.file ?? "unknown"}:${lineRef(finding)}`;
}

function sortFindings(a, b) {
  return (
    (severityOrder.get(a.severity) ?? 99) - (severityOrder.get(b.severity) ?? 99)
    || String(a.id).localeCompare(String(b.id))
  );
}

function markdownish(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderCode(finding) {
  const code = finding.fix_hint?.code ?? finding.code_fix;
  if (!code) return "";
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

function renderFindingCard(finding, { sideQuest = false } = {}) {
  const severity = slug(finding.severity || "low");
  const status = finding.status ?? "open";
  const open = ["critical", "high"].includes(severity) && openStatuses.has(status) ? " open" : "";
  const description = [finding.description, finding.impact ? `Impact: ${finding.impact}` : null]
    .filter(Boolean)
    .join("\n\n");
  const suggestion = finding.suggestion ?? finding.fix_hint?.summary ?? "No concrete fix provided.";
  const reviewers = Array.isArray(finding.reviewers) ? finding.reviewers.join(", ") : finding.reviewers;

  return `
        <details class="finding${sideQuest ? " side-quest-item" : ""}" data-severity="${severity}"${open}>
          <summary>
            <span class="pill ${severity}">${escapeHtml(severity.toUpperCase())}</span>
            <span class="finding-title">${
    escapeHtml(finding.id ? `${finding.id}: ${finding.title}` : finding.title)
  }</span>
            <span class="tag">${escapeHtml(finding.category ?? "uncategorized")}</span>
            <span class="tag">${escapeHtml(status)}</span>
            <span class="file-ref">${escapeHtml(location(finding))}</span>
          </summary>
          <div class="finding-body">
            <div class="finding-description"><p>${markdownish(description)}</p></div>
            <div class="finding-suggestion">
              <div class="suggestion-label">Suggested Fix</div>
              <p>${markdownish(suggestion)}</p>
              ${renderCode(finding)}
            </div>
            <div class="finding-meta">
              <span>Confidence: ${escapeHtml(finding.confidence ?? "unknown")}</span>
              <span>Flagged by: ${escapeHtml(reviewers ?? "unknown")}</span>
              <span>Fingerprint: ${escapeHtml(finding.fingerprint ?? "missing")}</span>
            </div>
          </div>
        </details>`;
}

const findings = Array.isArray(review.findings) ? review.findings : [];
const sideQuests = Array.isArray(review.side_quests) ? review.side_quests : [];
const openFindings = findings.filter((finding) => openStatuses.has(finding.status ?? "open"));
const closedFindings = findings.filter((finding) => !openStatuses.has(finding.status ?? "open"));
const counts = Object.fromEntries(
  severities.map((severity) => [
    severity,
    openFindings.filter((finding) => finding.severity === severity).length,
  ]),
);

function inferVerdict() {
  if (counts.critical > 1) return "rethink";
  if (counts.critical > 0 || counts.high > 0) return "fix-and-ship";
  return "ship-it";
}

function verdictInfo() {
  const verdict = review.verdict ?? inferVerdict();
  if (["ship", "ship-it"].includes(verdict)) return { className: "ship", icon: "✓", title: "Ship it" };
  if (verdict === "rethink") return { className: "rethink", icon: "✕", title: "Rethink" };
  return { className: "fix", icon: "⚠", title: "Fix and ship" };
}

function renderReportHtml() {
  const stats = review.stats ?? {};
  const verdict = verdictInfo();
  const assessment = review.assessment ?? "Review completed. See findings below for actionable issues.";
  const generatedDate = review.updated_at ?? review.generated_at ?? new Date().toISOString();
  const branch = review.branch ?? "unknown";
  const title = `Code Review — ${branch}`;
  const findingsHtml = findings.length
    ? findings.toSorted(sortFindings).map((finding) => renderFindingCard(finding)).join("\n")
    : `<div class="assessment">No findings. Clean bill of health.</div>`;
  const sideQuestsHtml = sideQuests.length
    ? `
      <div class="findings side-quest">
        <div class="section-title">Side Quests</div>
        <div class="side-quest-label">Pre-existing — not introduced by this PR</div>
        ${
      sideQuests.toSorted(sortFindings).map((finding) => renderFindingCard(finding, { sideQuest: true })).join("\n")
    }
      </div>`
    : "";

  const content = `
    <div class="container">
      <header class="header">
        <h1>Code Review <span class="branch">&rarr; ${escapeHtml(branch)}</span></h1>
        <div class="meta-row">
          <span class="stat">base: ${escapeHtml(review.base ?? "unknown")}</span>
          <span class="stat">${escapeHtml(generatedDate.slice(0, 10))}</span>
          <span class="stat">${escapeHtml(stats.commits ?? 0)} commits</span>
          <span class="stat">${escapeHtml(stats.files_changed ?? 0)} files</span>
          <span class="stat additions">+${escapeHtml(stats.lines_added ?? 0)}</span>
          <span class="stat deletions">&minus;${escapeHtml(stats.lines_removed ?? 0)}</span>
        </div>
      </header>

      <div class="dashboard">
        ${
    severities.map((severity) => `
        <div class="dash-card ${severity}">
          <div class="count">${counts[severity]}</div>
          <div class="label">${titleCase(severity)}</div>
        </div>`).join("")
  }
      </div>

      <div class="assessment">${markdownish(assessment)}</div>

      <div class="filter-bar">
        <button class="filter-btn active" onclick="filterFindings('all')">All</button>
        ${
    severities.map((severity) => `
        <button class="filter-btn" onclick="filterFindings('${severity}')">
          <span class="dot ${severity}"></span>${titleCase(severity)}
        </button>`).join("")
  }
      </div>

      <div class="findings">
        <div class="section-title">Findings</div>
        ${findingsHtml}
      </div>

      ${sideQuestsHtml}

      <div class="verdict ${verdict.className}">
        <div class="verdict-icon">${verdict.icon}</div>
        <h2>${verdict.title}</h2>
        <p>${markdownish(review.verdict_explanation ?? assessment)}</p>

        <table class="action-table">
          <thead><tr><th>Severity</th><th>Action Required</th><th>Timeline</th></tr></thead>
          <tbody>
            <tr><td><span class="pill critical">Critical</span></td><td>Must fix before merge</td><td>Immediate</td></tr>
            <tr><td><span class="pill high">High</span></td><td>Should fix before merge</td><td>This PR</td></tr>
            <tr><td><span class="pill medium">Medium</span></td><td>Fix soon, can merge</td><td>Next sprint</td></tr>
            <tr><td><span class="pill low">Low</span></td><td>Consider fixing</td><td>Backlog</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

  return template
    .replace("__TITLE__", escapeHtml(title))
    .replace("__CONTENT__", content)
    .replace(
      "<script type=\"application/json\" id=\"review-data\">{}</script>",
      `<script type="application/json" id="review-data">${escapeHtml(JSON.stringify(review))}</script>`,
    );
}

function renderFindingSummary(finding) {
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

function renderSummaryMarkdown() {
  const lines = [
    "# Code Review Summary",
    "",
    `- Review: ${review.review_id ?? "unknown"}`,
    `- Project: ${review.project ?? "unknown"}`,
    `- Branch: ${review.branch ?? "unknown"}`,
    `- Base: ${review.base ?? "unknown"}`,
    `- Verdict: ${titleCase(review.verdict ?? inferVerdict())}`,
    `- Open findings: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low`,
    "",
    review.assessment ?? "",
    "",
    "## Open Findings",
    "",
  ];

  if (openFindings.length === 0) {
    lines.push("No open findings.");
  } else {
    lines.push(...openFindings.toSorted(sortFindings).map(renderFindingSummary).join("\n\n").split("\n"));
  }

  if (sideQuests.length > 0) {
    lines.push("", "## Side Quests", "");
    lines.push(...sideQuests.toSorted(sortFindings).map(renderFindingSummary).join("\n\n").split("\n"));
  }

  if (closedFindings.length > 0) {
    lines.push("", "## Closed Findings", "");
    lines.push(...closedFindings.toSorted(sortFindings).map(renderFindingSummary).join("\n\n").split("\n"));
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

writeFileSync(join(outputDir, "report.html"), renderReportHtml());
writeFileSync(join(outputDir, "summary.md"), renderSummaryMarkdown());
