import { spawnSync } from "node:child_process";

export type BackendName = "claude" | "pi";

export type Route = { backend: BackendName; model?: string };

// Claude Code runs these directly as model aliases; anything else is Pi's job.
const CLAUDE_ALIASES = new Set(["opus", "sonnet", "haiku", "fable"]);

// Friendly names that map to a specific Pi model id. `codex` is ambiguous in a
// raw model search (it also matches Qwen3-Coder), so pin it explicitly.
const PI_ALIASES: Record<string, string> = {
  codex: "openai-codex/gpt-5.5",
};

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
      `Unknown model "${token}". Use a Claude alias (opus|sonnet|haiku|fable), ` +
        `"codex", or a full Pi provider/model id. Run: pi --list-models ${token}`,
    );
  }
  const exact = matches.find((m) => m.slice(m.lastIndexOf("/") + 1).toLowerCase() === lower);
  if (exact) return exact;
  if (matches.length === 1) return matches[0];
  throw new Error(
    `Ambiguous model "${token}" matches: ${matches.join(", ")}. Pass a full provider/model id.`,
  );
}

// Decide which runtime handles a request from the user-facing model token.
// Routing is the *only* place that knows pi-vs-claude; everything downstream is
// backend-native.
export function route(model: string | undefined, backend: BackendName | undefined): Route {
  if (backend === "claude") return { backend, model: model && model.toLowerCase() !== "claude" ? model : undefined };
  if (backend === "pi") {
    if (!model) throw new Error("--backend pi requires --model");
    return { backend, model: resolvePiModel(model) };
  }

  if (!model || model.toLowerCase() === "claude") return { backend: "claude" };

  const lower = model.toLowerCase();
  if (CLAUDE_ALIASES.has(lower) || lower.startsWith("claude-")) {
    return { backend: "claude", model };
  }
  return { backend: "pi", model: resolvePiModel(model) };
}
