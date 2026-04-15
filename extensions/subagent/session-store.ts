import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SavedSubagentSession } from "./types.js";

function getSessionStoreDir(): string {
	return path.join(os.homedir(), ".pi", "agent", "subagent-sessions");
}

function getSessionStorePath(sessionId: string): string {
	return path.join(getSessionStoreDir(), `${sessionId}.json`);
}

export function saveSubagentSession(metadata: SavedSubagentSession): void {
	const dir = getSessionStoreDir();
	fs.mkdirSync(dir, { recursive: true });
	const filePath = getSessionStorePath(metadata.sessionId);
	const tempPath = `${filePath}.tmp`;
	fs.writeFileSync(tempPath, JSON.stringify(metadata, null, 2), "utf-8");
	fs.renameSync(tempPath, filePath);
}

export function loadSubagentSession(
	sessionId: string,
): SavedSubagentSession | null {
	const filePath = getSessionStorePath(sessionId);
	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw) as Partial<SavedSubagentSession>;
		if (
			typeof parsed.sessionId !== "string" ||
			typeof parsed.agent !== "string" ||
			typeof parsed.cwd !== "string" ||
			typeof parsed.systemPrompt !== "string"
		) {
			return null;
		}
		return {
			sessionId: parsed.sessionId,
			agent: parsed.agent,
			agentSource:
				parsed.agentSource === "user" ||
				parsed.agentSource === "project" ||
				parsed.agentSource === "unknown"
					? parsed.agentSource
					: "unknown",
			cwd: parsed.cwd,
			model: typeof parsed.model === "string" ? parsed.model : undefined,
			thinking:
				typeof parsed.thinking === "string" ? parsed.thinking : undefined,
			tools: Array.isArray(parsed.tools)
				? parsed.tools.filter(
						(value): value is string => typeof value === "string",
					)
				: undefined,
			systemPrompt: parsed.systemPrompt,
		};
	} catch {
		return null;
	}
}
