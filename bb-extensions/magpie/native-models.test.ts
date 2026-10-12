import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { customModelEntries, parseNativeModels, replaceMagpieModels } from "./native-models.ts";

const catalog = JSON.parse(readFileSync(new URL("./fixtures/native-models.json", import.meta.url), "utf8"));

test("the catalog keeps converted models for both agents", () => {
  const models = parseNativeModels(catalog);
  assert.ok(models.some((model) => model.id.startsWith("claude/")));
  assert.ok(models.some((model) => model.id.startsWith("codex/")));
  assert.throws(() => parseNativeModels({ data: [catalog.data[0], catalog.data[0]] }), /duplicate/);
});

test("entries skip same-family models and dated aliases", () => {
  const models = [
    "claude/claude-opus-4-5",
    "claude/claude-opus-4-5-20251101",
    "codex/gpt-6.1-sol",
    "deepseek/deepseek-flash",
  ]
    .map((id) => ({ id, name: id, efforts: [] }));
  const codex = customModelEntries("codex", models).map((entry) => entry.model);
  const claude = customModelEntries("claude-code", models).map((entry) => entry.model);
  assert.ok(codex.includes("claude/claude-opus-4-5") && !codex.includes("claude/claude-opus-4-5-20251101"));
  assert.ok(!codex.some((id) => id.startsWith("codex/")));
  assert.deepEqual(claude, ["codex/gpt-6.1-sol", "deepseek/deepseek-flash"]);
});

test("sync replaces Magpie entries and keeps other config", () => {
  const stale = { providerId: "codex", model: "claude/old", displayName: "Magpie · Old" };
  const other = { providerId: "acp-x", model: "m" };
  const entries = customModelEntries("codex", [{ id: "claude/new", name: "New", efforts: [] }]);
  const result = replaceMagpieModels({ theme: "dark", customModels: [stale, other] }, entries);
  assert.deepEqual(result.config, { theme: "dark", customModels: [other, ...entries] });
  assert.deepEqual([result.added, result.removed, result.total], [1, 1, 1]);
  const again = replaceMagpieModels(result.config, entries);
  assert.deepEqual([again.added, again.removed], [0, 0]);
  assert.throws(() => replaceMagpieModels({ customModels: {} }, entries), /must be an array/);
});
