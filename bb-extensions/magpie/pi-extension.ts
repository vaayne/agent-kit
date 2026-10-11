import { type Catalog, catalogSchema } from "./config.ts";

/** Render standalone ESM; only BB session environment can set the proxy route. */
export function renderExtension(catalog: Catalog): string {
  const result = catalogSchema.safeParse(catalog);
  if (!result.success) throw new Error("Invalid Magpie model catalog");
  return `const catalog = ${JSON.stringify(result.data)};

export default function (pi) {
  const suppliedRoot = process.env.BB_MAGPIE_BASE_URL;
  const suppliedToken = process.env.BB_MAGPIE_TOKEN;
  let root = "http://127.0.0.1:1";
  let token = "magpie-catalog-placeholder";
  if (suppliedRoot || suppliedToken) {
    if (!suppliedRoot || !suppliedToken) {
      throw new Error("BB Magpie session requires both proxy environment variables");
    }
    // Pi interprets dollar references and leading commands in apiKey values.
    // BB generates hex/base64url tokens; reject other values before registration.
    if (!/^[A-Za-z0-9_.-]+$/.test(suppliedToken)) {
      throw new Error("Invalid BB Magpie proxy token");
    }
    let url;
    try { url = new URL(suppliedRoot); }
    catch { throw new Error("Invalid BB Magpie proxy URL"); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || url.search || url.hash) {
      throw new Error("Invalid BB Magpie proxy URL");
    }
    root = url.href.replace(/\\/+$/, "");
    token = suppliedToken;
  }
  pi.registerProvider("magpie", {
    name: "Magpie",
    api: "openai-completions",
    baseUrl: root + "/v1",
    apiKey: token,
    models: catalog.models.map((model) => ({
      ...model,
      baseUrl: model.api === "anthropic-messages" ? root : root + "/v1",
    })),
  });
}
`;
}
