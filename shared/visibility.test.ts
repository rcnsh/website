import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessSubject,
  DEFAULT_VISIBILITY,
  folderOf,
  inheritedFrom,
  parseRules,
  rulesVersion,
  servesPublicly,
  visibilityOf,
  type VisibilityRules,
} from "./visibility.ts";

const rules: VisibilityRules = {
  "": "unlisted",
  "audio/": "listed",
  "audio/drafts/": "private",
  "ShareX/": "private",
};

test("folderOf keeps the trailing slash and gives the root as empty", () => {
  assert.equal(folderOf("a/b/c.txt"), "a/b/");
  assert.equal(folderOf("c.txt"), "");
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

test("servesPublicly refuses private files, their thumbs, and dot paths", () => {
  assert.equal(servesPublicly(rules, "audio/song.mp3"), true);
  assert.equal(servesPublicly(rules, "video/clip.mp4"), true);
  assert.equal(servesPublicly(rules, "ShareX/2026/05/backup.tar.gz"), false);
  assert.equal(servesPublicly(rules, ".thumbs/ShareX/2026/clip.mp4.poster.webp"), false);
  assert.equal(servesPublicly(rules, ".thumbs/audio/song.mp3.peaks.json"), true);
  assert.equal(servesPublicly(rules, ".hidden/file"), false);
});

test("rulesVersion ignores insertion order and changes with the rules", () => {
  const a = rulesVersion({ "a/": "listed", "b/": "private" });
  const b = rulesVersion({ "b/": "private", "a/": "listed" });
  assert.equal(a, b);
  assert.notEqual(a, rulesVersion({ "a/": "listed", "b/": "unlisted" }));
  assert.notEqual(a, rulesVersion({ "a/": "listed" }));
});
