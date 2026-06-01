import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SavedDelegateSession } from "./types.js";

// UUID pattern for session ID validation (prevents path traversal)
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

function getSessionStoreDir(): string {
  return path.join(os.homedir(), ".pi", "agent", "delegate-sessions");
}

function getSessionStorePath(sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) {
    return null;
  }
  return path.join(getSessionStoreDir(), `${sessionId}.json`);
}

export function saveDelegateSession(metadata: SavedDelegateSession): void {
  if (!isValidSessionId(metadata.sessionId)) {
    throw new Error(`Invalid session ID format: ${metadata.sessionId}`);
  }
  const dir = getSessionStoreDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getSessionStorePath(metadata.sessionId);
  if (!filePath) {
    throw new Error(`Invalid session ID: ${metadata.sessionId}`);
  }
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(metadata, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

export function loadDelegateSession(sessionId: string): SavedDelegateSession | null {
  if (!isValidSessionId(sessionId)) {
    return null;
  }
  const filePath = getSessionStorePath(sessionId);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SavedDelegateSession>;
    if (
      typeof parsed.sessionId !== "string"
      || typeof parsed.preset !== "string"
      || typeof parsed.cwd !== "string"
      || typeof parsed.systemPrompt !== "string"
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      preset: parsed.preset,
      presetSource: parsed.presetSource === "preset"
          || parsed.presetSource === "user"
          || parsed.presetSource === "project"
          || parsed.presetSource === "unknown"
        ? parsed.presetSource
        : "unknown",
      cwd: parsed.cwd,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      thinking: typeof parsed.thinking === "string" ? parsed.thinking : undefined,
      tools: Array.isArray(parsed.tools)
        ? parsed.tools.filter((value): value is string => typeof value === "string")
        : undefined,
      systemPrompt: parsed.systemPrompt,
    };
  } catch {
    return null;
  }
}
