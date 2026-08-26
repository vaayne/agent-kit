import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { listTasks } from "./tasks-client.js";

export const taskNavigatorRpc = defineRpcContract({
  ping: {
    input: z.object({}).strict(),
    output: z.object({ count: z.number().int().nonnegative() }).strict(),
  },
});

export default function plugin(bb: BbPluginApi) {
  bb.rpc.register(taskNavigatorRpc, {
    async ping() {
      const { tasks } = await listTasks(bb);
      const count = tasks.length;
      bb.log.info(`Tasks RPC ping: ${count} tasks`);
      return { count };
    },
  });
}
