import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketTotals, hiddenTotals } from "./bucket-totals.ts";

test("sums every directory's files once", () => {
  const tree = {
    "": { folders: ["a/"], files: [["root.txt", 10, 100] as [string, number, number]] },
    "a/": { folders: [], files: [["a/one.png", 5, 300] as [string, number, number], ["a/two.png", 7, 200] as [string, number, number]] },
  };
  assert.deepEqual(bucketTotals(tree), { objects: 3, bytes: 22, lastUploaded: 300 });
});

test("an empty bucket has no last upload", () => {
  assert.deepEqual(bucketTotals({ "": { folders: [], files: [] } }), {
    objects: 0,
    bytes: 0,
    lastUploaded: null,
  });
});

test("hidden totals are what the visitors' tree leaves out", () => {
  const file = (name: string, size: number) => [name, size, 0] as [string, number, number];
  const full = {
    "": { folders: ["a/", "b/"], files: [] },
    "a/": { folders: [], files: [file("one.png", 5)] },
    "b/": { folders: [], files: [file("two.zip", 7), file("three.mp3", 11)] },
  };
  const visible = { "": { folders: ["a/"], files: [] }, "a/": full["a/"] };
  assert.deepEqual(hiddenTotals(full, visible), { objects: 2, bytes: 18 });
});
