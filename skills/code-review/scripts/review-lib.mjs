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

export function unresolvedItems(review) {
  return Array.isArray(review?.unresolved) ? review.unresolved : [];
}

// { complete, recorded, limitations } — recorded=false for bundles that predate
// the verification field; absence must not read as a pass.
export function verificationState(review) {
  const verification = review?.verification;
  if (!verification || typeof verification !== "object") {
    return { complete: false, recorded: false, limitations: [] };
  }
  const rawLimits = verification.limitations ?? verification.notes;
  const limitations = Array.isArray(rawLimits) ? rawLimits : rawLimits ? [rawLimits] : [];
  return { complete: verification.complete === true, recorded: true, limitations };
}

// ship-it requires zero open findings (confirmed medium/low defects still
// count — they are real issues, not style notes), zero unresolved doubts, and
// verification explicitly recorded as complete.
export function inferVerdict(review) {
  if (openSeverityCounts(review).critical > 1) return "rethink";
  if (openFindings(review).length > 0) return "fix-and-ship";
  if (unresolvedItems(review).length > 0) return "needs-review";
  return verificationState(review).complete ? "ship-it" : "needs-review";
}

// A stored verdict is a claim, not ground truth: an explicit ship-it never
// outranks open findings, unresolved doubts, or missing verification.
// Non-pass verdicts are the reviewer's call and stay as recorded.
export function effectiveVerdict(review) {
  const stored = review?.verdict;
  if (stored && stored !== "ship" && stored !== "ship-it") return stored;
  return inferVerdict(review);
}

export function summarizeAssessment(review) {
  const active = openFindings(review);
  const counts = openSeverityCounts(review);
  const parts = [
    active.length === 0
      ? "No open findings remain."
      : `${active.length} open finding${active.length === 1 ? "" : "s"}: `
        + `${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`,
  ];

  const unresolved = unresolvedItems(review).length;
  if (unresolved > 0) {
    parts.push(`${unresolved} unresolved doubt${unresolved === 1 ? "" : "s"} still need verification.`);
  }

  const verification = verificationState(review);
  if (!verification.complete) {
    parts.push(
      verification.recorded
        ? "Verification incomplete — see limitations."
        : "Verification not recorded; treat conclusions as unverified.",
    );
  }

  return parts.join(" ");
}

export function validateTransition(currentStatus, nextStatus) {
  const current = currentStatus ?? "open";
  const allowed = validTransitions.get(current);
  if (allowed?.has(nextStatus)) return;

  const allowedText = allowed ? [...allowed].join(", ") : "none";
  throw new Error(`Invalid status transition: ${current} -> ${nextStatus}. Allowed next states: ${allowedText}.`);
}
