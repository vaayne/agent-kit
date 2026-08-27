import type { ThreadSummary } from "./server.js";
import type { Strings } from "./strings.js";

export type AttentionState = "asking" | "error" | "running" | "unread" | "none";

/** One state per row, by how urgently it needs a human: asking > error > running > unread. */
export function attentionOf(threads: readonly Pick<ThreadSummary, "status" | "archived" | "unread">[]): AttentionState {
  const live = threads.filter((thread) => !thread.archived);
  if (live.some((thread) => thread.status === "pendingInteraction")) return "asking";
  if (live.some((thread) => thread.status === "error")) return "error";
  if (live.some((thread) => thread.status === "running")) return "running";
  if (live.some((thread) => thread.unread)) return "unread";
  return "none";
}

/**
 * A 12px drawn icon in the status slot. Stroke 1.75 throughout so the four
 * states read as one family; colour carries urgency (warning asks, destructive
 * failed, primary in motion), and only the spinner moves.
 */
export function StatusIcon({ state, t }: { state: AttentionState; t: Strings }) {
  if (state === "none") return <span className="size-3 shrink-0" aria-hidden="true" />;
  const label = t.state[state];
  const common = { width: 12, height: 12, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, role: "img" as const, "aria-label": label };
  switch (state) {
    case "running":
      return (
        <svg {...common} className="size-3 shrink-0 animate-spin text-primary" style={{ animationDuration: "900ms" }}>
          <path d="M14 8a6 6 0 1 1-6-6" />
        </svg>
      );
    case "asking":
      return (
        <svg {...common} className="size-3 shrink-0 text-warning">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M6.3 6.4a1.7 1.7 0 1 1 2.5 1.5c-.5.3-.8.6-.8 1.1" />
          <circle cx="8" cy="11.2" r="0.4" fill="currentColor" />
        </svg>
      );
    case "error":
      return (
        <svg {...common} className="size-3 shrink-0 text-destructive">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.8v3.7" />
          <circle cx="8" cy="11.2" r="0.4" fill="currentColor" />
        </svg>
      );
    case "unread":
      return (
        <svg {...common} className="size-3 shrink-0 text-primary">
          <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
