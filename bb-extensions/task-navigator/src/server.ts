import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { TaskBindings, taskInstructions } from "./task-bindings.js";
import { listTasks } from "./tasks-client.js";

export const taskNavigatorRpc = defineRpcContract({
  ping: {
    input: z.object({}).strict(),
    output: z.object({ count: z.number().int().nonnegative() }).strict(),
  },
});

export default function plugin(bb: BbPluginApi) {
  const bindings = new TaskBindings(bb);
  void bindings.rebuild().catch((error: unknown) => {
    bb.log.warn(`Could not initialize task bindings: ${errorMessage(error)}`);
  });

  bb.events.on("thread.created", async ({ thread }) => {
    try {
      const binding = await bindings.inherit(thread);
      if (binding !== undefined) {
        bb.log.info(`Inherited task ${binding.key} for thread ${thread.id}`);
      }
    } catch (error) {
      bb.log.warn(
        `Could not inherit a task for thread ${thread.id}: ${errorMessage(error)}`,
      );
    }
  });
  bb.events.on("thread.deleted", ({ thread }) => {
    bindings.forget(thread.id);
  });
  bb.agents.configure((context) => {
    const binding = bindings.getForAgentContext(context);
    return {
      tools: [],
      skills: [],
      ...(binding === undefined
        ? {}
        : { instructions: taskInstructions(binding) }),
    };
  });

  bb.rpc.register(taskNavigatorRpc, {
    async ping() {
      const { tasks } = await listTasks(bb);
      const count = tasks.length;
      bb.log.info(`Tasks RPC ping: ${count} tasks`);
      await bindings.rebuild();
      return { count };
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
