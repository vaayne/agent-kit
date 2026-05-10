/**
 * Notify Extension that plays a sound when the agent finishes its task.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const MAC_SOUND_PATH = "/System/Library/Sounds/Ping.aiff";

async function playSound(pi: ExtensionAPI): Promise<void> {
  if (process.platform === "darwin") {
    try {
      const result = await pi.exec("afplay", [MAC_SOUND_PATH], { timeout: 2000 });
      if (result.code === 0) {
        return;
      }
    } catch {
      // Fall back to terminal bell.
    }
  }

  process.stdout.write("\x07");
}

export default function(pi: ExtensionAPI) {
  pi.on("agent_end", async () => {
    await playSound(pi);
  });
}
