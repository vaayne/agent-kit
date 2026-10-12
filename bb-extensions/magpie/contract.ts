import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { catalogSchema } from "./config.ts";

const installation = z.object({ agentDir: z.string(), installed: z.boolean(), modelCount: z.number() });
export const hostContract = defineRpcContract({
  inspect: { input: z.object({}), output: installation },
  install: { input: catalogSchema, output: installation },
  remove: { input: z.object({}), output: installation },
});
