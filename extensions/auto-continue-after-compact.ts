import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MESSAGE_TYPE = "auto-continue-after-compact";
const CONTINUATION_PROMPT =
  "Automatic context compaction finished. Continue the current task from the compacted context, follow its next steps, and finish the work or report a concrete blocker.";

export default function(pi: ExtensionAPI) {
  let canAutoContinue = true;

  pi.on("session_start", () => {
    canAutoContinue = true;
  });

  pi.on("input", (event) => {
    if (event.source !== "extension") {
      canAutoContinue = true;
    }
  });

  pi.on("session_compact", (event, ctx) => {
    // Overflow recovery already retries natively. Manual compaction should remain
    // an explicit user boundary, so only bridge threshold compaction.
    if (event.reason !== "threshold" || event.willRetry) return;

    // Pi already resumes after compaction when a steering/follow-up message exists.
    if (ctx.hasPendingMessages() || !canAutoContinue) return;

    // One synthetic continuation per real user input prevents an ineffective
    // compaction from creating an autonomous compact/continue loop.
    canAutoContinue = false;
    pi.sendMessage(
      {
        customType: MESSAGE_TYPE,
        content: CONTINUATION_PROMPT,
        display: false,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  });
}
