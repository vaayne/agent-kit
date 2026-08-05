import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import assert from "node:assert/strict";
import test from "node:test";
import autoContinueAfterCompact from "./auto-continue-after-compact.ts";

type Handler = (event: any, ctx: any) => void;

function setup() {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ message: any; options: any }> = [];
  const pi = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
    sendMessage(message: any, options: any) {
      sent.push({ message, options });
    },
  } as unknown as ExtensionAPI;

  autoContinueAfterCompact(pi);
  handlers.get("session_start")?.({}, {});

  return { handlers, sent };
}

test("queues one hidden follow-up after threshold compaction", () => {
  const { handlers, sent } = setup();
  const compact = handlers.get("session_compact")!;
  const ctx = { hasPendingMessages: () => false };

  compact({ reason: "threshold", willRetry: false }, ctx);
  compact({ reason: "threshold", willRetry: false }, ctx);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.message.display, false);
  assert.deepEqual(sent[0]?.options, {
    triggerTurn: true,
    deliverAs: "followUp",
  });
});

test("re-arms after a real user input", () => {
  const { handlers, sent } = setup();
  const compact = handlers.get("session_compact")!;
  const ctx = { hasPendingMessages: () => false };

  compact({ reason: "threshold", willRetry: false }, ctx);
  handlers.get("input")?.({ source: "interactive" }, {});
  compact({ reason: "threshold", willRetry: false }, ctx);

  assert.equal(sent.length, 2);
});

test("leaves native retries, manual compaction, and queued messages alone", () => {
  const { handlers, sent } = setup();
  const compact = handlers.get("session_compact")!;

  compact(
    { reason: "overflow", willRetry: true },
    { hasPendingMessages: () => false },
  );
  compact(
    { reason: "manual", willRetry: false },
    { hasPendingMessages: () => false },
  );
  compact(
    { reason: "threshold", willRetry: false },
    { hasPendingMessages: () => true },
  );

  assert.equal(sent.length, 0);
});
