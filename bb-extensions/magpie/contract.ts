import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { catalogSchema } from "./config.ts";

export const hostContract = defineRpcContract({
  inspect: {
    input: z.object({}),
    output: z.object({ agentDir: z.string(), installed: z.boolean(), modelCount: z.number() }),
  },
  install: {
    input: catalogSchema,
    output: z.object({ agentDir: z.string(), installed: z.boolean(), modelCount: z.number() }),
  },
  remove: {
    input: z.object({}),
    output: z.object({ agentDir: z.string(), installed: z.boolean(), modelCount: z.number() }),
  },
});
