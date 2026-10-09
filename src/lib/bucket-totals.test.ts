import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketTotals } from "./bucket-totals.ts";

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
