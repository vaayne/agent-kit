import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  delete settings.enabledModels;
  await writeFile(join(agent, "settings.json"), JSON.stringify(settings));
  await files.remove();
  // A key the user deleted stays deleted.
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), {
    defaultProvider: "original",
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

test("install refuses an unmanaged Magpie extension and preserves other extensions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magpie-unmanaged-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  const data = join(root, "plugin");
  const extension = join(agent, "extensions/magpie/index.js");
  const otherExtension = join(agent, "extensions/custom.js");
  await mkdir(join(agent, "extensions/magpie"), { recursive: true });
  await writeFile(extension, "user extension");
  await writeFile(otherExtension, "other extension");
  const files = hostFiles(agent, data);
  const catalog = parseMagpieConfig({ providers: { magpie: { models: [{ id: "group/test" }] } } }, {});
  await assert.rejects(files.install(catalog), /already exists/);
  assert.equal(await readFile(extension, "utf8"), "user extension");
  assert.equal((await files.inspect()).installed, false);
  await rm(extension);
  await files.install(catalog);
  await files.install(catalog);
  await files.remove();
  assert.equal(await readFile(otherExtension, "utf8"), "other extension");
});

test("remove restores the prior selection after a failed update", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "magpie-failed-update-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const agent = join(root, "agent");
  await mkdir(agent);
  const original = { defaultProvider: "original", defaultModel: "prior" };
  await writeFile(join(agent, "settings.json"), JSON.stringify(original));
  const files = hostFiles(agent, join(root, "plugin"));
  await files.install(parseMagpieConfig({ providers: { magpie: { models: [{ id: "a" }] } } }, {}));
  // A read-only extension directory fails the update after the recovery state is saved.
  const extensionDir = join(agent, "extensions/magpie");
  await chmod(extensionDir, 0o500);
  await assert.rejects(files.install(parseMagpieConfig({ providers: { magpie: { models: [{ id: "b" }] } } }, {})));
  await chmod(extensionDir, 0o700);
  assert.equal(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).defaultModel, "a");
  await files.remove();
  assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), original);
});
