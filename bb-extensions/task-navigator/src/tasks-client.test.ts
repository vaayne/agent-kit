import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { listTasks } from "./tasks-client.js";

function fakeBb(callRpc: BbPluginApi["sdk"]["plugins"]["callRpc"]): BbPluginApi {
  return {
    sdk: { plugins: { callRpc } },
  } as unknown as BbPluginApi;
}

describe("tasks client", () => {
  it("calls the built-in listTasks RPC with its wire method", async () => {
    const callRpc = vi.fn().mockResolvedValue({
      tasks: [
        {
          id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
          projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
          title: "Example",
          description: "",
          status: "todo",
          priority: "none",
          dueDate: null,
          parentTaskId: null,
          labelIds: [],
        },
      ],
      nextCursor: null,
    });
    const result = await listTasks(fakeBb(callRpc));

    expect(result.tasks).toHaveLength(1);
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: "tasks", method: "listTasks", input: {} }),
    );
  });
});
