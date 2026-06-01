export const severities = ["critical", "high", "medium", "low"];
export const openStatuses = new Set(["open", "reopened"]);
export const severityOrder = new Map(severities.map((severity, index) => [severity, index]));

const validTransitions = new Map([
  ["open", new Set(["fixed", "accepted-risk", "false-positive", "stale"])],
  ["fixed", new Set(["reopened"])],
  ["stale", new Set(["open", "fixed"])],
  ["reopened", new Set(["fixed", "accepted-risk", "false-positive"])],
]);

export function isOpenStatus(status) {
  return openStatuses.has(status ?? "open");
}

export function openFindings(review) {
  return (review.findings ?? []).filter((finding) => isOpenStatus(finding.status));
}

export function openSeverityCounts(review) {
  return openFindings(review).reduce(
    (acc, finding) => {
      const severity = severities.includes(finding.severity) ? finding.severity : "low";
      acc[severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

export function inferVerdict(review) {
  const counts = openSeverityCounts(review);
  if (counts.critical > 1) return "rethink";
  if (counts.critical > 0 || counts.high > 0) return "fix-and-ship";
  return "ship-it";
}

export function summarizeAssessment(review) {
  const active = openFindings(review);
  const counts = openSeverityCounts(review);

  if (active.length === 0) return "No open findings remain.";
  return `${active.length} open finding${
    active.length === 1 ? "" : "s"
  }: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;
}

export function validateTransition(currentStatus, nextStatus) {
  const current = currentStatus ?? "open";
  const allowed = validTransitions.get(current);
  if (allowed?.has(nextStatus)) return;

  const allowedText = allowed ? [...allowed].join(", ") : "none";
  throw new Error(`Invalid status transition: ${current} -> ${nextStatus}. Allowed next states: ${allowedText}.`);
}
