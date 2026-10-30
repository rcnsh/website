import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessSubject,
  decideRead,
  DEFAULT_VISIBILITY,
  inheritedFrom,
  parseRules,
  prefixOf,
  RULES_FRESH_MS,
  rulesLoader,
  rulesVersion,
  visibilityOf,
  type VisibilityRules,
} from "./visibility.ts";

const rules: VisibilityRules = {
  "": "unlisted",
  "audio/": "listed",
  "audio/drafts/": "private",
  "ShareX/": "private",
};

test("prefixOf keeps the trailing slash and gives the root as empty", () => {
  assert.equal(prefixOf("a/b/c.txt"), "a/b/");
  assert.equal(prefixOf("c.txt"), "");
  assert.equal(prefixOf("a/b/"), "a/b/");
});

test("a key takes its nearest folder's setting", () => {
  assert.equal(visibilityOf(rules, "audio/song.mp3"), "listed");
  assert.equal(visibilityOf(rules, "audio/drafts/demo.wav"), "private");
  assert.equal(visibilityOf(rules, "audio/drafts/old/demo.wav"), "private");
  assert.equal(visibilityOf(rules, "video/clip.mp4"), "unlisted");
  assert.equal(visibilityOf(rules, "key.asc"), "unlisted");
});

test("a folder prefix is judged by its own setting first", () => {
  assert.equal(visibilityOf(rules, "audio/"), "listed");
  assert.equal(visibilityOf(rules, "audio/drafts/"), "private");
  assert.equal(visibilityOf(rules, ""), "unlisted");
});

test("no rules at all falls back to the default", () => {
  assert.equal(visibilityOf({}, "anything/at/all.txt"), DEFAULT_VISIBILITY);
});

test("a folder named after an Object member is not mistaken for a rule", () => {
  assert.equal(visibilityOf({}, "constructor/x"), DEFAULT_VISIBILITY);
  assert.equal(visibilityOf({}, "__proto__/x"), DEFAULT_VISIBILITY);
});

test("inheritedFrom names the folder a setting comes from", () => {
  assert.equal(inheritedFrom(rules, "audio/"), null);
  assert.equal(inheritedFrom(rules, "audio/live/"), "audio/");
  assert.equal(inheritedFrom(rules, "video/"), "");
  assert.equal(inheritedFrom({}, "video/"), "");
});

test("an unknown stored value reads as private", () => {
  assert.deepEqual(
    parseRules([
      { prefix: "a/", visibility: "listed" },
      { prefix: "b/", visibility: "Public" },
    ]),
    { "a/": "listed", "b/": "private" },
  );
});

test("thumbs answer to their source; other dot paths to nothing", () => {
  assert.equal(accessSubject(".thumbs/ShareX/a.mp4.poster.webp"), "ShareX/a.mp4.poster.webp");
  assert.equal(accessSubject(".thumbs/.secret/a.webp"), null);
  assert.equal(accessSubject(".thumbs/"), null);
  assert.equal(accessSubject(".env"), null);
  assert.equal(accessSubject("a/.git/HEAD"), null);
  assert.equal(accessSubject("a/b.txt"), "a/b.txt");
});

const visitor = async () => false;
const owner = async () => true;
const loaded = async () => rules;
const refusal = async (key: string | null, isOwner = visitor, load = loaded) => {
  const decision = await decideRead(key, load, isOwner);
  return decision.ok ? decision.visibility : decision.refusal;
};

test("decideRead refuses private files, their thumbs, and dot paths to a visitor", async () => {
  assert.equal(await refusal("audio/song.mp3"), "listed");
  assert.equal(await refusal("video/clip.mp4"), "unlisted");
  assert.equal(await refusal("ShareX/2026/05/backup.tar.gz"), "not-found");
  assert.equal(await refusal(".thumbs/ShareX/2026/clip.mp4.poster.webp"), "not-found");
  assert.equal(await refusal(".thumbs/audio/song.mp3.peaks.json"), "listed");
  assert.equal(await refusal(".hidden/file"), "not-found");
  assert.equal(await refusal("a/.git/HEAD"), "not-found");
});

test("decideRead refuses keys that name nothing as bad requests", async () => {
  for (const key of [null, "", "audio/", "../etc/passwd", "a/../ShareX/x"]) {
    assert.equal(await refusal(key), "bad-request", String(key));
  }
  assert.equal(await refusal("v1..2/notes.txt"), "unlisted");
});

test("decideRead lets the owner read private files and their thumbs", async () => {
  assert.equal(await refusal("ShareX/2026/05/backup.tar.gz", owner), "private");
  assert.equal(await refusal(".thumbs/ShareX/clip.mp4.poster.webp", owner), "private");
  // Dot paths stay refused even for the owner: they answer to nothing.
  assert.equal(await refusal(".env", owner), "not-found");
});

test("decideRead asks about the owner only for private files", async () => {
  let asked = 0;
  const counting = async () => {
    asked++;
    return false;
  };
  await refusal("audio/song.mp3", counting);
  await refusal(".env", counting);
  assert.equal(asked, 0);
  await refusal("ShareX/x", counting);
  assert.equal(asked, 1);
});

test("decideRead refuses when the rules cannot be read, before asking about the owner", async () => {
  const failing = async (): Promise<VisibilityRules> => {
    throw new Error("D1 down");
  };
  let asked = false;
  const decision = await decideRead("audio/song.mp3", failing, async () => {
    asked = true;
    return true;
  });
  assert.equal(decision.ok, false);
  assert.equal(!decision.ok && decision.refusal, "unavailable");
  assert.equal(asked, false);
});

test("rulesLoader memoises for RULES_FRESH_MS and reads again after", async () => {
  let clock = 1_000;
  let reads = 0;
  let rows = [{ prefix: "a/", visibility: "listed" }];
  const loader = rulesLoader(async () => {
    reads++;
    return rows;
  }, () => clock);

  assert.deepEqual(await loader.load(), { "a/": "listed" });
  rows = [{ prefix: "a/", visibility: "private" }];
  clock += RULES_FRESH_MS - 1;
  assert.deepEqual(await loader.load(), { "a/": "listed" });
  assert.equal(reads, 1);

  clock += 1;
  assert.deepEqual(await loader.load(), { "a/": "private" });
  assert.equal(reads, 2);
});

test("rulesLoader's forget makes the next load read again", async () => {
  let reads = 0;
  const loader = rulesLoader(async () => {
    reads++;
    return [];
  }, () => 0);
  await loader.load();
  loader.forget();
  await loader.load();
  assert.equal(reads, 2);
});

test("rulesLoader throws on a failed read rather than serving a stale or empty copy", async () => {
  let clock = 0;
  let fail = false;
  const loader = rulesLoader(async () => {
    if (fail) throw new Error("D1 down");
    return [{ prefix: "", visibility: "listed" }];
  }, () => clock);
  await loader.load();
  fail = true;
  clock += RULES_FRESH_MS;
  await assert.rejects(loader.load(), /D1 down/);
  await assert.rejects(loader.load(), /D1 down/);
});

test("rulesVersion ignores insertion order and changes with the rules", () => {
  const a = rulesVersion({ "a/": "listed", "b/": "private" });
  const b = rulesVersion({ "b/": "private", "a/": "listed" });
  assert.equal(a, b);
  assert.notEqual(a, rulesVersion({ "a/": "listed", "b/": "unlisted" }));
  assert.notEqual(a, rulesVersion({ "a/": "listed" }));
});
