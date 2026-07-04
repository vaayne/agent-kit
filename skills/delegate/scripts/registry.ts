import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BackendName } from "./router.ts";

export type SessionRecord = {
  backend: BackendName;
  model?: string;
  cwd: string;
  created: string;
};

export type SessionRegistry = Record<string, SessionRecord>;

const MAX_SESSIONS = 200;
const REGISTRY_PATH = join(homedir(), ".agents", "delegate-sessions.json");

export function loadRegistry(): SessionRegistry {
  if (!existsSync(REGISTRY_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SessionRegistry;
  } catch {
    return {};
  }
}

export function lookupSession(id: string): SessionRecord | undefined {
  const registry = loadRegistry();
  return registry[id] ?? Object.entries(registry).find(([key]) => key.startsWith(id))?.[1];
}

export function saveSession(id: string, record: Omit<SessionRecord, "created">): void {
  const registry = loadRegistry();
  registry[id] = { ...record, created: new Date().toISOString() };

  const pruned = Object.fromEntries(
    Object.entries(registry)
      .sort(([, a], [, b]) => Date.parse(b.created) - Date.parse(a.created))
      .slice(0, MAX_SESSIONS),
  );

  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(pruned, null, 2)}\n`);
}
