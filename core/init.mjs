/**
 * `company-os init`: a vault you can run a command against, not an empty room.
 *
 * The first version wrote a config and stopped. You then ran `index` on zero
 * files, `check` on nothing and `search` on an empty database, and had to guess
 * what the thing was for. So init writes the folders too, and `--example` fills
 * them with a small company that has a real problem in it: the first `check`
 * finds it. The demo is the explanation.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULTS, CONFIG_FILE } from "./config.mjs";

const FOLDERS = ["knowledge", "accounts/leads", "accounts/customers", "inbox", "outputs", "transcripts/_inbox"];

/**
 * A folder cloned from the company-brain template
 * (github.com/mondayrunner/company-brain) is recognised by these two files.
 * init then writes a config that matches its layout and leaves every
 * existing file alone: the brain is the canon, init only adds the engine.
 */
export function isCompanyBrain(dir) {
  return existsSync(join(dir, "AGENTS.md")) && existsSync(join(dir, "knowledge", "README.md"));
}

const BRAIN_FOLDERS = ["accounts/leads", "accounts/customers", "accounts/lost", "accounts/churned", "inbox", "outputs", "transcripts/_inbox"];

/** The config for a company-brain folder. Every path here exists in the template. */
function brainConfig({ name, language }) {
  const base = starterConfig({ name, language });
  return {
    ...base,
    kinds: [
      { kind: "knowledge", prefix: "knowledge/" },
      { kind: "account", pattern: "^accounts/[^/]+/" },
      { kind: "contact", prefix: "contacts/" },
      { kind: "playbook", prefix: "playbooks/" },
      { kind: "legal", prefix: "legal/" },
      { kind: "transcript", prefix: "transcripts/" },
    ],
    accounts: { ...base.accounts, sides: ["leads", "customers", "lost", "churned"], openSides: ["leads"], wonSides: ["customers"] },
    canon: {
      company: "company.md",
      positioning: "knowledge/positioning.md",
      pricing: "knowledge/pricing.md",
      finance: "knowledge/finance.md",
      brand: "knowledge/brand.md",
      team: "knowledge/team.md",
      compass: "knowledge/compass.md",
      decisions: "knowledge/decisions.md",
    },
    pipeline: {
      file: "pipeline.md",
      updateLine: "Last update",
      logHeading: "## Log",
      leads: { heading: "## Active leads", columns: ["since", "who", "stage", "action", "ball", "folder"], who: "who", ball: "ball", action: "action" },
      ballSelf: ["you", "me", "us"],
    },
    checks: { knowledge: { dir: "knowledge", slaDays: 60 }, docs: ["AGENTS.md", "README.md"] },
  };
}

const IGNORE_LINES = [".company-os/", "outputs/", "*.log"];

/** The config a fresh vault starts with. Every path here matches FOLDERS. */
function starterConfig({ name, language }) {
  return {
    name,
    language,
    db: DEFAULTS.db,
    stateDir: DEFAULTS.stateDir,
    outputs: "outputs",
    ignore: ["node_modules", ".git", ".company-os"],
    kinds: [
      { kind: "knowledge", prefix: "knowledge/" },
      { kind: "account", pattern: "^accounts/[^/]+/" },
    ],
    accounts: {
      root: "accounts",
      sides: ["leads", "customers"],
      openSides: ["leads"],
      wonSides: ["customers"],
      statusFile: "STATUS.md",
      ballLine: "**Ball with:**",
    },
    transcripts: { inbox: "transcripts/_inbox" },
    connectors: { markdown: {}, status: {} },
    checks: { knowledge: { dir: "knowledge", slaDays: 60 }, docs: ["CLAUDE.md"] },
    ui: { title: name, panels: [] },
  };
}

const CLAUDE_MD = (name) => `# ${name}

The company brain. Markdown is the truth; \`.company-os/brain.db\` is a search
index built from it, and throwing it away costs nothing.

| Question | Where the answer lives |
|---|---|
| What we know | \`knowledge/\` |
| A customer or a lead | \`accounts/<side>/<name>/STATUS.md\` |
| What a job found, and what it wants from you | \`inbox/\` |

Rules:

- **Anything outward-facing is a proposal.** Sending, publishing, invoicing and
  deleting wait for a human who has seen the final version.
- **Do not copy a number a system already knows.** Ask the source. A copied
  figure is wrong the day after you paste it.
- Run \`company-os check\` when you change something structural. It says what
  broke before you find out the hard way.
`;

const README = (name) => `# ${name}

\`\`\`bash
company-os index     # read the markdown into the index
company-os search "…"  # find it back
company-os check     # what drifted
company-os status    # what is in the brain
\`\`\`

Add a source, a tile, a check or a job: see the company-os docs (\`docs/extending.md\`).
`;

// The example is one lead, one customer and a wiki page, with one thing wrong
// on purpose: the pipeline row says the ball is with them, the lead's status
// file says it is with you. `check` finds it on the first run. That is the
// whole idea in one command, which beats a paragraph explaining it.
const EXAMPLE = (today) => ({
  "knowledge/positioning.md": `---
status: current
last_verified: ${today}
---

# Positioning

We build the thing the customer cannot buy off the shelf. Not the cheapest and
not the biggest: the one they call when the standard answer does not fit.

Who we are not for: anyone shopping on price alone.
`,
  "accounts/customers/northwind/STATUS.md": `---
account: accounts/customers/northwind
status: active
---

# Northwind

**Ball with:** them

Running since March. Monthly retainer of €500.

## Log

- 2026-01-08 — renewed for another year.
`,
  "accounts/leads/harper-co/STATUS.md": `---
account: accounts/leads/harper-co
status: open
---

# Harper & Co

**Ball with:** you

Asked for a proposal on 4 January. Nothing sent yet.

## Log

- 2026-01-04 — first call.
`,
  "pipeline.md": `# Pipeline

Last update: 2026-01-08

## Active leads

| Since | Who | Stage | Next action | Ball |
|---|---|---|---|---|
| 2026-01-04 | Harper & Co | proposal | write the proposal | them |

## Recurring

Northwind pays €500 per month.
`,
});

export async function init(dir, { name = "My company", language = "en", example = false } = {}) {
  const file = join(dir, CONFIG_FILE);
  if (existsSync(file)) throw new Error(`${CONFIG_FILE} already exists in ${dir}`);

  const written = [];
  const kept = [];
  // Never overwrite: a file that is already there is the user's, not ours.
  const put = async (rel, text) => {
    const target = join(dir, rel);
    if (existsSync(target)) { kept.push(rel); return; }
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text);
    written.push(rel);
  };

  const brain = isCompanyBrain(dir);
  if (brain && example) throw new Error("this folder is already a company brain; --example is for an empty folder");
  const folders = brain ? BRAIN_FOLDERS : FOLDERS;
  for (const f of folders) await mkdir(join(dir, f), { recursive: true });

  const config = brain ? brainConfig({ name, language }) : starterConfig({ name, language });
  if (example) {
    config.pipeline = {
      file: "pipeline.md",
      updateLine: "Last update",
      logHeading: "## Log",
      leads: { heading: "## Active leads", columns: ["since", "who", "stage", "action", "ball"], who: "who", ball: "ball", action: "action" },
      ballSelf: ["you", "me", "us"],
    };
  }

  await put(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  await put("CLAUDE.md", CLAUDE_MD(name));
  await put("README.md", README(name));
  // The index and the job state are derived; the vault is the canon and the only thing worth committing.
  const ignore = join(dir, ".gitignore");
  if (existsSync(ignore)) {
    const have = await readFile(ignore, "utf8");
    const missing = IGNORE_LINES.filter((l) => !have.split("\n").includes(l));
    if (missing.length) { await writeFile(ignore, have.replace(/\n?$/, "\n") + missing.join("\n") + "\n"); written.push(".gitignore"); }
  } else await put(".gitignore", IGNORE_LINES.join("\n") + "\n");
  if (example) for (const [rel, text] of Object.entries(EXAMPLE(new Date().toISOString().slice(0, 10)))) await put(rel, text);

  return { dir, folders, written, kept, example, brain };
}

/** What to do next, in the order that makes the thing explain itself. */
export function nextSteps({ example, brain }) {
  if (brain) return [
    "Recognised a company brain: config written, your files left alone.",
    "",
    "company-os index      read the brain",
    "company-os canon      the canon keys (pricing, compass, decisions, ...)",
    "company-os check      what drifted",
    "company-os serve      the same answers as MCP tools for your agent",
  ];
  return [
    "company-os index      read what is there",
    "company-os status     what the brain now holds",
    example ? "company-os check      finds the drift the example plants: the pipeline says the ball is with them, the account file says it is with you" : "company-os check      what drifted (nothing yet, in an empty vault)",
    'company-os search "…"  find it back',
    "",
    "Then: add your own markdown, connect a source (docs/extending.md), and put",
    "`company-os index` on a schedule with `company-os jobs install`.",
  ];
}
