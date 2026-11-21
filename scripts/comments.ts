import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { type Comment, findComments, kindOf } from "./lib/comments.ts";

const BASELINE = "comments-baseline.json";
const [mode = "check", flag] = process.argv.slice(2);

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => f && kindOf(f));

const found = new Map<string, Comment[]>();
for (const file of files) {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const comments = findComments(source, kindOf(file)!);
  if (comments.length) found.set(file, comments);
}

const fingerprint = (c: Comment) =>
  createHash("sha1").update(c.text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 10);

type Baseline = Record<string, string[]>;
const current: Baseline = Object.fromEntries(
  [...found]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([f, cs]) => [f, cs.map(fingerprint).sort()]),
);

const readBaseline = (): Baseline => {
  let text: string;
  try {
    text = readFileSync(BASELINE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return JSON.parse(text);
};

const compare = (baseline: Baseline) => {
  const added: string[] = [];
  const removed: string[] = [];
  const kept: Baseline = {};
  for (const file of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    const allowed = [...(baseline[file] ?? [])];
    const comments = found.get(file) ?? [];
    for (const c of comments) {
      const at = allowed.indexOf(fingerprint(c));
      if (at === -1) added.push(`  ${file}:${c.line}  ${c.text.split("\n")[0].slice(0, 70)}`);
      else {
        (kept[file] ??= []).push(allowed[at]);
        allowed.splice(at, 1);
      }
    }
    if (allowed.length) removed.push(`  ${file}: ${allowed.length} gone`);
  }
  for (const f of Object.keys(kept)) kept[f].sort();
  return { added, removed, kept };
};

const count = (b: Baseline) => Object.values(b).reduce((n, l) => n + l.length, 0);

if (mode === "list") {
  const out = [...found].flatMap(([file, cs]) => cs.map((c) => ({ file, ...c })));
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} else if (mode === "stats") {
  const all = [...found.values()].flat();
  console.log(
    JSON.stringify({
      files: found.size,
      comments: all.length,
      ownLines: all.reduce((a, c) => a + c.ownLines, 0),
    }),
  );
} else if (mode === "update") {
  const { added, kept } = compare(readBaseline());
  const next = flag === "--accept-new" ? current : kept;
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`[comments] baseline: ${count(next)} comments in ${Object.keys(next).length} files.`);
  if (added.length && flag !== "--accept-new") {
    console.error(`[comments] Not added to the baseline, delete them:\n${added.join("\n")}`);
    process.exit(1);
  }
} else {
  const { added, removed } = compare(readBaseline());
  if (added.length) {
    console.error(
      `[comments] Code carries no comments; these are new:\n${added.join("\n")}\nPut the reason in an ADR (docs/adr/) or in a name.`,
    );
  }
  if (removed.length) {
    console.error(
      `[comments] Comments were deleted, so the baseline must ratchet down:\n${removed.join("\n")}\nRun "npm run lint:comments:update" and commit ${BASELINE}.`,
    );
  }
  if (added.length || removed.length) process.exit(1);
  console.log(`[comments] ${count(current)} comments left, none new.`);
}
