#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node render-report.mjs <review.json> <report.html>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "report-template.html");
const template = readFileSync(templatePath, "utf8");
const review = JSON.parse(readFileSync(inputPath, "utf8"));

const severities = ["critical", "high", "medium", "low"];
const openStatuses = new Set(["open", "reopened"]);

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
  return String(value ?? "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
    severities.indexOf(a.severity) - severities.indexOf(b.severity)
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

function renderFinding(finding, { sideQuest = false } = {}) {
  const severity = slug(finding.severity || "low");
  const status = finding.status ?? "open";
  const open = severity === "critical" && openStatuses.has(status) ? " open" : "";
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
            <div class="finding-description">
              <p>${markdownish(description)}</p>
            </div>
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

function verdictInfo() {
  const verdict = review.verdict ?? inferVerdict();
  if (["ship", "ship-it"].includes(verdict)) {
    return { className: "ship", icon: "✓", title: "Ship it" };
  }
  if (["rethink"].includes(verdict)) {
    return { className: "rethink", icon: "✕", title: "Rethink" };
  }
  return { className: "fix", icon: "⚠", title: "Fix and ship" };
}

function inferVerdict() {
  const active = findings.filter((finding) => openStatuses.has(finding.status ?? "open"));
  const critical = active.filter((finding) => finding.severity === "critical").length;
  const high = active.filter((finding) => finding.severity === "high").length;
  if (critical > 1) return "rethink";
  if (critical > 0 || high > 0) return "fix-and-ship";
  return "ship-it";
}

const findings = Array.isArray(review.findings) ? review.findings : [];
const sideQuests = Array.isArray(review.side_quests) ? review.side_quests : [];
const counts = Object.fromEntries(
  severities.map((severity) => [
    severity,
    findings.filter((finding) => finding.severity === severity).length,
  ]),
);
const stats = review.stats ?? {};
const verdict = verdictInfo();
const assessment = review.assessment ?? "Review completed. See findings below for actionable issues.";
const generatedDate = review.updated_at ?? review.generated_at ?? new Date().toISOString();
const branch = review.branch ?? "unknown";
const title = `Code Review — ${branch}`;

const findingsHtml = findings.length
  ? findings.sort(sortFindings).map((finding) => renderFinding(finding)).join("\n")
  : `<div class="assessment">No findings. Clean bill of health.</div>`;
const sideQuestsHtml = sideQuests.length
  ? `
      <div class="findings side-quest">
        <div class="section-title">Side Quests</div>
        <div class="side-quest-label">Pre-existing — not introduced by this PR</div>
        ${sideQuests.sort(sortFindings).map((finding) => renderFinding(finding, { sideQuest: true })).join("\n")}
      </div>`
  : "";

const body = `
  <body>
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle theme">&#9684;</button>

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
    </div>

    <script type="application/json" id="review-data">${escapeHtml(JSON.stringify(review))}</script>
    <script>
    function toggleTheme() {
      const html = document.documentElement;
      const current = html.getAttribute("data-theme");
      html.setAttribute("data-theme", current === "dark" ? "light" : "dark");
    }

    function filterFindings(severity) {
      document.querySelectorAll(".filter-btn").forEach(btn =>
        btn.classList.remove("active")
      );
      event.target.closest(".filter-btn").classList.add("active");

      document.querySelectorAll(".finding").forEach(el => {
        if (severity === "all" || el.dataset.severity === severity) {
          el.style.display = "";
        } else {
          el.style.display = "none";
        }
      });
    }
    </script>
  </body>`;

let html = template
  .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
  .replace(/<body>[\s\S]*?<\/body>/, body);

writeFileSync(outputPath, html);
