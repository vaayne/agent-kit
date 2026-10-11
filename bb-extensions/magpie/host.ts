import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { hostContract } from "./contract.ts";
import { hostFiles } from "./host-files.ts";

const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
// Serialize this worker's config writes. Pi config is one file per machine.
let pending: Promise<unknown> = Promise.resolve();
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const result = pending.then(run);
  pending = result.catch(() => {});
  return result;
}

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    inspect: (_, context) => serialized(() => hostFiles(agentDir, context.experimental_paths.dataDir).inspect()),
    install: (catalog, context) =>
      serialized(() => hostFiles(agentDir, context.experimental_paths.dataDir).install(catalog)),
    remove: (_, context) => serialized(() => hostFiles(agentDir, context.experimental_paths.dataDir).remove()),
  },
});
