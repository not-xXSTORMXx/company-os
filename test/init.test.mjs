import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { init } from "../core/init.mjs";

async function fresh(opts) {
  const dir = await mkdtemp(join(tmpdir(), "os-init-"));
  const r = await init(dir, opts);
  return { dir, r, clean: () => rm(dir, { recursive: true, force: true }) };
}

test("init writes a config, the folders, a gitignore for the derived files and nothing else", async () => {
  const { dir, r, clean } = await fresh({ name: "Acme" });
  try {
    assert.deepEqual(r.written.sort(), [".gitignore", "CLAUDE.md", "README.md", "company-os.config.json"]);
    assert.match(await readFile(join(dir, ".gitignore"), "utf8"), /^\.company-os\/$/m);
    const cfg = JSON.parse(await readFile(join(dir, "company-os.config.json"), "utf8"));
    assert.equal(cfg.name, "Acme");
    assert.equal(cfg.language, "en");
    assert.equal(cfg.ui.title, "Acme");
    for (const f of r.folders) assert.ok((await readdir(join(dir, f))) !== undefined, `${f} exists`);
  } finally { await clean(); }
});

test("the example plants a drift the default checks can see", async () => {
  const { dir, clean } = await fresh({ name: "Acme", example: true });
  try {
    const cfg = JSON.parse(await readFile(join(dir, "company-os.config.json"), "utf8"));
    assert.equal(cfg.pipeline.file, "pipeline.md");
    const pipeline = await readFile(join(dir, "pipeline.md"), "utf8");
    const status = await readFile(join(dir, "accounts/leads/harper-co/STATUS.md"), "utf8");
    // The row says "them", the status file says "you". That disagreement is
    // the whole demo; if someone "fixes" one of them the first run says nothing.
    assert.match(pipeline, /\| Harper & Co \|.*\| them \|/);
    assert.match(status, /\*\*Ball with:\*\* you/);
  } finally { await clean(); }
});

test("init refuses to overwrite an existing vault", async () => {
  const { dir, clean } = await fresh({ name: "Acme" });
  try {
    await assert.rejects(() => init(dir, { name: "Other" }), /already exists/);
  } finally { await clean(); }
});

test("init in a company-brain folder writes a matching config and overwrites nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "os-brain-"));
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(dir, "knowledge"), { recursive: true });
    await writeFile(join(dir, "AGENTS.md"), "# rules\n");
    await writeFile(join(dir, "CLAUDE.md"), "@AGENTS.md\n");
    await writeFile(join(dir, "README.md"), "# my brain\n");
    await writeFile(join(dir, "knowledge", "README.md"), "# Knowledge\n");
    await writeFile(join(dir, ".gitignore"), ".DS_Store\n");
    const r = await init(dir, { name: "Acme" });
    assert.equal(r.brain, true);
    assert.equal(await readFile(join(dir, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
    assert.equal(await readFile(join(dir, "README.md"), "utf8"), "# my brain\n");
    const ignore = await readFile(join(dir, ".gitignore"), "utf8");
    assert.match(ignore, /^\.DS_Store$/m);
    assert.match(ignore, /^\.company-os\/$/m);
    const cfg = JSON.parse(await readFile(join(dir, "company-os.config.json"), "utf8"));
    assert.deepEqual(cfg.accounts.sides, ["leads", "customers", "lost", "churned"]);
    assert.equal(cfg.canon.compass, "knowledge/compass.md");
    assert.equal(cfg.pipeline.file, "pipeline.md");
    await assert.rejects(() => init(dir, { name: "Acme" }), /already exists/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
