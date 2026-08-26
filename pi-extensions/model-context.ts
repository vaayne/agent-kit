import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MESSAGE_TYPE = "runtime-model";

function modelIdentity(model: { provider: string; id: string }): string {
  return `${model.provider}/${model.id}`;
}

export default function(pi: ExtensionAPI) {
  let announcedModel: string | undefined;

  function announce(model: { provider: string; id: string } | undefined): void {
    if (!model) return;

    const identity = modelIdentity(model);
    if (identity === announcedModel) return;
    announcedModel = identity;

    // Custom messages are converted to user messages for LLM context without
    // triggering a model turn or changing the cache-sensitive system prompt.
    pi.sendMessage({
      customType: MESSAGE_TYPE,
      content: `The active runtime model is now ${identity}. Treat this as authoritative.`,
      display: false,
    });
  }

  pi.on("session_start", (_event, ctx) => {
    announce(ctx.model);
  });

  pi.on("model_select", (event) => {
    announce(event.model);
  });
}
