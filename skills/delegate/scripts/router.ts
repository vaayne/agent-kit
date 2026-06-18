import { spawnSync } from "node:child_process";
import { routes } from "./routes.ts";

export type BackendName = "claude" | "pi";

export type Route = { backend: BackendName; model?: string };

const CLAUDE_ALIASES = new Set(routes.claude.aliases);
const PI_ALIASES = routes.pi.aliases;

function isClaudeToken(lower: string): boolean {
  return CLAUDE_ALIASES.has(lower) || routes.claude.prefixes.some((p) => lower.startsWith(p));
}

// Parse `provider model ...` rows from `pi --list-models <query>`, skipping the
// header. Returns full Pi model ids as `provider/model`.
function searchPiModels(token: string): string[] {
  const res = spawnSync("pi", ["--list-models", token], { encoding: "utf-8" });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s{2,}|\t/))
    .filter((cols) => cols.length >= 2 && cols[0] && cols[1])
    .map((cols) => `${cols[0]}/${cols[1]}`);
}

function resolvePiModel(token: string): string {
  const lower = token.toLowerCase();
  if (PI_ALIASES[lower]) return PI_ALIASES[lower];
  if (token.includes("/")) return token; // already a provider/model id

  const matches = searchPiModels(token);
  if (matches.length === 0) {
    throw new Error(
      `Unknown model "${token}". Use a Claude alias (${routes.claude.aliases.join("|")}), ` +
        `a Pi alias (${Object.keys(PI_ALIASES).join("|")}), or a full Pi provider/model id. ` +
        `Run: pi --list-models ${token}`,
    );
  }
  const exact = matches.find((m) => m.slice(m.lastIndexOf("/") + 1).toLowerCase() === lower);
  if (exact) return exact;
  if (matches.length === 1) return matches[0];
  throw new Error(
    `Ambiguous model "${token}" matches: ${matches.join(", ")}. Pass a full provider/model id.`,
  );
}

// Decide which runtime handles a request from the user-facing model token. This
// is the *only* place that knows pi-vs-claude; everything downstream is
// backend-native. Routing data lives in routes.ts.
export function route(model: string | undefined, backend: BackendName | undefined): Route {
  if (backend === "claude") return { backend, model: model && model.toLowerCase() !== "claude" ? model : undefined };
  if (backend === "pi") {
    if (!model) throw new Error("--backend pi requires --model");
    return { backend, model: resolvePiModel(model) };
  }

  if (!model || model.toLowerCase() === "claude") return { backend: routes.defaultBackend as BackendName };
  if (isClaudeToken(model.toLowerCase())) return { backend: "claude", model };
  return { backend: "pi", model: resolvePiModel(model) };
}
