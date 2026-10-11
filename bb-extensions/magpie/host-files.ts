import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Catalog } from "./config.ts";
import { renderExtension } from "./pi-extension.ts";

type JsonObject = Record<string, unknown>;
const managedKeys = ["defaultProvider", "defaultModel", "enabledModels"] as const;
type State = { before: JsonObject; written: JsonObject; modelCount: number };

async function readObject(path: string): Promise<JsonObject | null> {
  try {
    const text = await readFile(path, "utf8");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON in ${path}.`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Expected a JSON object in ${path}.`);
    }
    return value as JsonObject;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(path: string, value: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function hostFiles(agentDir: string, dataDir: string) {
  const extensionDir = join(agentDir, "extensions", "magpie");
  const extensionFile = join(extensionDir, "index.js");
  const settingsFile = join(agentDir, "settings.json");
  const stateFile = join(dataDir, "pi-install.json");
  const state = async () => await readObject(stateFile) as State | null;
  const result = (value: State | null) => ({ agentDir, installed: value !== null, modelCount: value?.modelCount ?? 0 });
  return {
    async inspect() {
      return result(await state());
    },
    async install(catalog: Catalog) {
      const previous = await state();
      if (!previous) {
        try {
          await readFile(extensionFile);
          throw new Error(`The extension already exists without a connector backup: ${extensionFile}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const settings = await readObject(settingsFile) ?? {};
      const before: JsonObject = previous?.before ?? {};
      if (!previous) {
        for (const key of managedKeys) {
          if (Object.hasOwn(settings, key)) before[key] = settings[key];
        }
      }
      const written = {
        defaultProvider: "magpie",
        defaultModel: catalog.defaultModel,
        enabledModels: catalog.models.map((model) => `magpie/${model.id}`),
      };
      const next: State = { before, written, modelCount: catalog.models.length };
      await mkdir(dataDir, { recursive: true });
      await mkdir(extensionDir, { recursive: true });
      // Save recovery state before changing Pi's selection.
      await atomicWrite(stateFile, JSON.stringify(next, null, 2) + "\n");
      await atomicWrite(extensionFile, renderExtension(catalog));
      await atomicWrite(settingsFile, JSON.stringify({ ...settings, ...written }, null, 2) + "\n");
      return result(next);
    },
    async remove() {
      const previous = await state();
      if (!previous) return result(null);
      const settings = await readObject(settingsFile) ?? {};
      for (const key of managedKeys) {
        // Keep values the user changed after the last sync.
        if (JSON.stringify(settings[key]) !== JSON.stringify(previous.written[key])) continue;
        if (Object.hasOwn(previous.before, key)) settings[key] = previous.before[key];
        else delete settings[key];
      }
      await atomicWrite(settingsFile, JSON.stringify(settings, null, 2) + "\n");
      await rm(extensionFile, { force: true });
      await rm(stateFile, { force: true });
      return result(null);
    },
  };
}
