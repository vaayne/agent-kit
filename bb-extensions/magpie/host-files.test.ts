import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseMagpieConfig } from "./config.ts";
import { hostFiles } from "./host-files.ts";

test("sync preserves source config and unrelated preferences; remove restores only managed values", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magpie-host-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent);
  const original = {
    defaultProvider: "original",
    defaultModel: "prior",
    enabledModels: ["original/*"],
    theme: "user-theme",
  };
  const catalog = parseMagpieConfig({ providers: { magpie: { models: [{ id: "group/test" }] } } }, {});
  const source = "{\"providers\":{\"magpie\":{\"apiKey\":\"source-secret\",\"models\":[{\"id\":\"group/test\"}]}}}";
  await writeFile(join(agent, "models.json"), source);
  await writeFile(join(agent, "settings.json"), JSON.stringify(original));
  const files = hostFiles(agent, join(root, "plugin"));
  await files.install(catalog);
  await files.install(catalog);
  assert.equal(await readFile(join(agent, "models.json"), "utf8"), source);
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  assert.equal(settings.defaultProvider, "magpie");
  assert.deepEqual(settings.enabledModels, ["magpie/group/test"]);
  assert.equal(settings.theme, "user-theme");
  assert.doesNotMatch(await readFile(join(agent, "extensions/magpie/index.js"), "utf8"), /source-secret/);
  settings.theme = "changed";
  settings.defaultModel = "user-edit";
  await writeFile(join(agent, "settings.json"), JSON.stringify(settings));
  await files.remove();
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), {
    ...original,
    theme: "changed",
    defaultModel: "user-edit",
  });
  assert.equal((await files.inspect()).installed, false);
  await assert.rejects(readFile(join(agent, "extensions/magpie/index.js")), { code: "ENOENT" });
});

test("first install can be removed without adding prior selection keys", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magpie-new-host-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = hostFiles(join(root, "agent"), join(root, "plugin"));
  await files.install(parseMagpieConfig({ providers: { magpie: { models: [{ id: "test" }] } } }, {}));
  await files.remove();
  assert.deepEqual(JSON.parse(await readFile(join(root, "agent/settings.json"), "utf8")), {});
});

test("rename migrates the managed extension and keeps the original restore state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magpie-migrate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const data = join(root, "plugin");
  await mkdir(join(agent, "extensions/bb-magpie"), { recursive: true });
  await mkdir(data);
  const before = { defaultProvider: "original", defaultModel: "prior" };
  const written = { defaultProvider: "bb-magpie", defaultModel: "group/test", enabledModels: ["bb-magpie/group/test"] };
  await writeFile(join(data, "pi-install.json"), JSON.stringify({ before, written, modelCount: 1 }));
  await writeFile(join(agent, "settings.json"), JSON.stringify({ ...written, theme: "kept" }));
  await writeFile(join(agent, "extensions/bb-magpie/index.js"), "legacy extension");
  const files = hostFiles(agent, data);
  const catalog = parseMagpieConfig({ providers: { magpie: { models: [{ id: "group/test" }] } } }, {});
  await mkdir(join(agent, "extensions/magpie"));
  await writeFile(join(agent, "extensions/magpie/index.js"), "user extension");
  await assert.rejects(files.install(catalog), /already exists/);
  assert.equal(await readFile(join(agent, "extensions/magpie/index.js"), "utf8"), "user extension");
  await rm(join(agent, "extensions/magpie/index.js"));
  await files.install(catalog);
  await files.install(catalog);
  const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  assert.equal(settings.defaultProvider, "magpie");
  assert.deepEqual(settings.enabledModels, ["magpie/group/test"]);
  assert.equal(settings.theme, "kept");
  assert.match(await readFile(join(agent, "extensions/magpie/index.js"), "utf8"), /registerProvider\("magpie"/);
  await assert.rejects(readFile(join(agent, "extensions/bb-magpie/index.js")), { code: "ENOENT" });
  await files.remove();
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), { ...before, theme: "kept" });
});
