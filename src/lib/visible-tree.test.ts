import { test } from "node:test";
import assert from "node:assert/strict";
import type { R2File, R2Tree } from "./r2";
import { listedListing, listedTree } from "./visible-tree.ts";

const f = (name: string): R2File => [name, 1, 1];

const tree: R2Tree = {
  "": { folders: ["ShareX", "audio", "misc"], files: [f("key.asc")] },
  "ShareX/": { folders: [], files: [f("backup.tar.gz")] },
  "audio/": { folders: ["drafts"], files: [f("song.mp3")] },
  "audio/drafts/": { folders: [], files: [f("demo.wav")] },
  "misc/": { folders: ["shown"], files: [f("secret.txt")] },
  "misc/shown/": { folders: [], files: [f("ok.png")] },
};

const rules = {
  "": "unlisted",
  "ShareX/": "private",
  "audio/": "listed",
  "audio/drafts/": "unlisted",
  "misc/shown/": "listed",
} as const;

test("only listed folders' files survive, and the root keeps its paths", () => {
  assert.deepEqual(listedTree(tree, rules), {
    "": { folders: ["audio", "misc"], files: [] },
    "audio/": { folders: [], files: [f("song.mp3")] },
    "misc/": { folders: ["shown"], files: [] },
    "misc/shown/": { folders: [], files: [f("ok.png")] },
  });
});

test("nothing listed leaves an empty root, not a missing one", () => {
  assert.deepEqual(listedTree(tree, {}), { "": { folders: [], files: [] } });
});

test("a listed root shows its files and unruled children inherit it", () => {
  const out = listedTree(tree, { "": "listed", "ShareX/": "private" });
  assert.deepEqual(out[""].folders, ["audio", "misc"]);
  assert.deepEqual(out[""].files, [f("key.asc")]);
  assert.equal(out["ShareX/"], undefined);
  assert.deepEqual(out["audio/drafts/"].files, [f("demo.wav")]);
});

test("a single listing keeps listed subfolders by their own setting", () => {
  assert.deepEqual(listedListing("", tree[""], rules), { folders: ["audio"], files: [] });
  assert.deepEqual(listedListing("audio/", tree["audio/"], rules), {
    folders: [],
    files: [f("song.mp3")],
  });
});
