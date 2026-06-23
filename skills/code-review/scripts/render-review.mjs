#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inferVerdict, isOpenStatus, openSeverityCounts, severities, severityOrder } from "./review-lib.mjs";

const [inputPath, outputDir] = process.argv.slice(2);

if (!inputPath || !outputDir) {
  console.error("Usage: node render-review.mjs <review.json> <output-dir>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "..", "references", "report-template.html");
const template = readFileSync(templatePath, "utf8");
const review = JSON.parse(readFileSync(inputPath, "utf8"));

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

// Tolerate an agent emitting a list where prose is expected.
function asText(value) {
  if (Array.isArray(value)) return value.map((item) => `- ${item}`).join("\n");
  return value;
}

function safeJsonForScript(value) {
  return JSON.stringify(value).replace(/<\/script/gi, "<\\/script");
}

function renderCode(finding) {
  const code = finding.fix_hint?.code ?? finding.code_fix;
  if (!code) return "";
  return `<pre><code>${escapeHtml(code)}</code></pre>`;
}

function renderFindingCard(finding, { sideQuest = false } = {}) {
  const severity = slug(finding.severity || "low");
  const status = finding.status ?? "open";
  const open = ["critical", "high"].includes(severity) && isOpenStatus(status) ? " open" : "";
  const description = [finding.description, finding.impact ? `Impact: ${finding.impact}` : null]
    .filter(Boolean)
    .join("\n\n");
  const suggestion = finding.suggestion ?? finding.fix_hint?.summary ?? "No concrete fix provided.";
  const reviewers = Array.isArray(finding.reviewers) ? finding.reviewers.join(", ") : finding.reviewers;

  return `
        <details class="finding${sideQuest ? " side-quest-item" : ""}" data-severity="${severity}"${open}>
          <summary>
            <span class="finding-chevron">▸</span>
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
const openFindings = findings.filter((finding) => isOpenStatus(finding.status));
const closedFindings = findings.filter((finding) => !isOpenStatus(finding.status));
const counts = openSeverityCounts(review);

function verdictInfo() {
  const verdict = review.verdict ?? inferVerdict(review);
  if (["ship", "ship-it"].includes(verdict)) return { className: "ship", icon: "✓", title: "Ship it" };
  if (verdict === "rethink") return { className: "rethink", icon: "✕", title: "Rethink" };
  return { className: "fix", icon: "⚠", title: "Fix and ship" };
}

function riskLevel(value) {
  const level = slug(value || "");
  return ["none", "low", "medium", "high"].includes(level) ? level : "low";
}

function renderRiskBadge(name, risk) {
  if (!risk) return "";
  const level = riskLevel(risk.level);
  const notes = asText(risk.notes ?? risk.note ?? "");
  return `
            <div class="risk-badge level-${level}">
              <div class="risk-head">
                <span class="risk-name">${escapeHtml(name)}</span>
                <span class="risk-level">${escapeHtml(level.toUpperCase())}</span>
              </div>
              <div class="risk-notes">${markdownish(notes)}</div>
            </div>`;
}

function renderOverview() {
  const overview = review.overview;
  if (!overview || typeof overview !== "object") return "";

  const item = (label, value) => {
    const text = asText(value);
    if (!text) return "";
    return `
          <div class="overview-item">
            <div class="overview-label">${escapeHtml(label)}</div>
            <div class="overview-text">${markdownish(text)}</div>
          </div>`;
  };

  const items = [
    item("Purpose", overview.purpose),
    item("Changes", overview.changes),
    item("Rationale", overview.rationale),
    item("Necessity", overview.necessity),
  ].join("");

  const badges = [
    renderRiskBadge("Regression Risk", overview.regression_risk),
    renderRiskBadge("Security", overview.security),
  ].filter(Boolean).join("");
  const riskRow = badges ? `<div class="risk-row">${badges}</div>` : "";

  if (!items && !riskRow) return "";
  return `
      <div class="overview">
        <div class="section-title">Overview</div>
        <div class="overview-card">
          ${items}
          ${riskRow}
        </div>
      </div>`;
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

  function countClass(sev) {
    return counts[sev] > 0 ? `vc ${sev} has-count` : `vc ${sev}`;
  }

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
        <div class="verdict-row">
          <span class="verdict-label ${verdict.className}">${verdict.icon} ${verdict.title}</span>
          <span class="verdict-counts">${
    severities.map((sev) => `<span class="${countClass(sev)}">${counts[sev]} ${sev}</span>`).join(" ")
  }</span>
        </div>
        <div class="assessment">${markdownish(assessment)}</div>
      </header>

      ${renderOverview()}

      <div class="filter-bar">
        <button class="filter-btn active" onclick="filterFindings('all', event)">All</button>
        ${
    severities.map((severity) => `
        <button class="filter-btn" onclick="filterFindings('${severity}', event)">
          <span class="dot ${severity}"></span>${titleCase(severity)}
        </button>`).join("")
  }
      </div>

      <div class="findings">
        <div class="section-title">Findings</div>
        ${findingsHtml}
      </div>

      ${sideQuestsHtml}
    </div>`;

  return template
    .replace("__TITLE__", escapeHtml(title))
    .replace("__CONTENT__", content)
    .replace(
      /<script type="application\/json" id="review-data">[\s\S]*?<\/script>/,
      `<script type="application/json" id="review-data">${safeJsonForScript(review)}</script>`,
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

function renderOverviewMarkdown() {
  const overview = review.overview;
  if (!overview || typeof overview !== "object") return [];

  const lines = ["## Overview", ""];
  const para = (label, value) => {
    const text = asText(value);
    if (text) lines.push(`**${label}:** ${text}`, "");
  };
  para("Purpose", overview.purpose);
  para("Changes", overview.changes);
  para("Rationale", overview.rationale);
  para("Necessity", overview.necessity);

  const risk = (label, value) => {
    if (!value) return;
    const level = value.level ? `${value.level} — ` : "";
    para(label, `${level}${asText(value.notes ?? value.note ?? "")}`);
  };
  risk("Regression risk", overview.regression_risk);
  risk("Security", overview.security);

  return lines.length > 2 ? lines : [];
}

function renderSummaryMarkdown() {
  const lines = [
    "# Code Review Summary",
    "",
    `- Review: ${review.review_id ?? "unknown"}`,
    `- Project: ${review.project ?? "unknown"}`,
    `- Branch: ${review.branch ?? "unknown"}`,
    `- Base: ${review.base ?? "unknown"}`,
    `- Verdict: ${titleCase(review.verdict ?? inferVerdict(review))}`,
    `- Open findings: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low`,
    "",
    review.assessment ?? "",
    "",
  ];

  lines.push(...renderOverviewMarkdown());
  lines.push("## Open Findings", "");

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
