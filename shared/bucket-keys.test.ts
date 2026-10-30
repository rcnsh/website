import { test } from "node:test";
import assert from "node:assert/strict";
import { folderPrefix, isHiddenKey, objectKey } from "./bucket-keys.ts";

test("objectKey refuses the empty key, folders and traversal", () => {
  for (const raw of [null, undefined, "", "a/", "..", "../a", "a/../b", "a/.."]) {
    assert.equal(objectKey(raw), null, String(raw));
  }
  assert.equal(objectKey("a/b.txt"), "a/b.txt");
  assert.equal(objectKey("v1..2.txt"), "v1..2.txt");
});

test("folderPrefix cleans slashes and keeps the root as empty", () => {
  assert.equal(folderPrefix(null), "");
  assert.equal(folderPrefix(""), "");
  assert.equal(folderPrefix("///"), "");
  assert.equal(folderPrefix("/a//b"), "a/b/");
  assert.equal(folderPrefix("a/b/"), "a/b/");
});

test("folderPrefix refuses traversal and hidden folders instead of falling back to the root", () => {
  for (const raw of ["..", "a/../b", ".thumbs", ".thumbs/a/", "a/.git/"]) {
    assert.equal(folderPrefix(raw), null, raw);
  }
});

test("a leading dot anywhere hides a key; a dot inside a name does not", () => {
  assert.ok(isHiddenKey(".thumbs/x.png"));
  assert.ok(isHiddenKey("a/.git/HEAD"));
  assert.ok(!isHiddenKey("x.thumbs/png"));
});
