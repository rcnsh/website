import { test } from "node:test";
import assert from "node:assert/strict";
import { createBucket, type BucketDeps, type BucketPage } from "./bucket-view.ts";
import type { R2Tree } from "./r2";
import type { VisibilityRules } from "../../shared/visibility.ts";

const KEYS = [
  "key.asc",
  "audio/song.mp3",
  "audio/drafts/demo.wav",
  "ShareX/backup.tar.gz",
  "misc/notes.txt",
  ".thumbs/ShareX/backup.tar.gz.poster.webp",
  ".thumbs/audio/song.mp3.peaks.json",
];

const RULES: VisibilityRules = {
  "": "unlisted",
  "audio/": "listed",
  "audio/drafts/": "unlisted",
  "ShareX/": "private",
};

/** R2's list over a fixed set of keys, delimiter included, in one page. */
function fakeList(keys: string[]): BucketDeps["list"] {
  return async ({ prefix = "", delimiter }) => {
    const objects: BucketPage["objects"] = [];
    const delimitedPrefixes = new Set<string>();
    for (const key of [...keys].sort()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (delimiter && rest.includes(delimiter)) {
        delimitedPrefixes.add(prefix + rest.slice(0, rest.indexOf(delimiter) + 1));
        continue;
      }
      objects.push({ key, size: 10, uploaded: new Date(0) });
    }
    return { objects, delimitedPrefixes: [...delimitedPrefixes], truncated: false };
  };
}

function bucket({
  keys = KEYS,
  rules = async () => RULES,
  inline = true,
}: { keys?: string[]; rules?: BucketDeps["rules"]; inline?: boolean } = {}) {
  // `inline: false` stands in for a bucket past the tree cap.
  return createBucket({
    list: fakeList(keys),
    cacheTree: async (load): Promise<R2Tree | null> => (inline ? load() : null),
    rules,
  });
}

const paths = (tree: R2Tree | null) =>
  Object.entries(tree ?? {}).flatMap(([prefix, listing]) => [
    ...listing.folders.map((name) => `${prefix}${name}/`),
    ...listing.files.map(([name]) => `${prefix}${name}`),
  ]);

test("a visitor's tree shows listed folders only; the owner's shows everything", async () => {
  const visitor = paths(await bucket().view(false).tree());
  assert.deepEqual(visitor.sort(), ["audio/", "audio/song.mp3"]);

  const owner = paths(await bucket().view(true).tree());
  assert.ok(owner.includes("ShareX/backup.tar.gz"));
  assert.ok(owner.includes("misc/notes.txt"));
  assert.ok(owner.includes("audio/drafts/demo.wav"));
  assert.ok(!owner.some((path) => path.startsWith(".thumbs")));
});

for (const inline of [true, false]) {
  const mode = inline ? "from the tree" : "from a live listing";

  test(`a visitor cannot list private or unlisted folders (${mode})`, async () => {
    const view = bucket({ inline }).view(false);
    assert.deepEqual((await view.listing(""))?.folders, ["audio"]);
    assert.deepEqual((await view.listing(""))?.files, []);
    assert.deepEqual((await view.listing("ShareX/"))?.files, []);
    assert.deepEqual((await view.listing("misc/"))?.files, []);
    assert.deepEqual((await view.listing("audio/"))?.files.map(([name]) => name), ["song.mp3"]);
  });

  test(`the owner lists private and unlisted folders (${mode})`, async () => {
    const view = bucket({ inline }).view(true);
    assert.deepEqual((await view.listing(""))?.folders, ["audio", "misc", "ShareX"]);
    assert.deepEqual((await view.listing("ShareX"))?.files.map(([name]) => name), ["backup.tar.gz"]);
  });

  test(`nobody lists a hidden folder or walks up out of one (${mode})`, async () => {
    for (const owner of [true, false]) {
      const view = bucket({ inline }).view(owner);
      assert.equal(await view.listing(".thumbs/"), null);
      assert.equal(await view.listing("audio/../ShareX/"), null);
    }
  });

  test(`a visitor's search finds listed files only (${mode})`, async () => {
    const files = await bucket({ inline }).view(false).search("a");
    assert.deepEqual(files.map(([key]) => key), ["audio/song.mp3"]);
    const all = await bucket({ inline }).view(true).search("backup");
    assert.deepEqual(all.map(([key]) => key), ["ShareX/backup.tar.gz"]);
  });
}

test("canRead refuses traversal, dot paths and private files and their thumbs to a visitor", async () => {
  const view = bucket().view(false);
  const refusal = async (key: string | null) => {
    const decision = await view.canRead(key);
    return decision.ok ? "ok" : decision.refusal;
  };
  assert.equal(await refusal("../ShareX/backup.tar.gz"), "bad-request");
  assert.equal(await refusal(null), "bad-request");
  assert.equal(await refusal(".env"), "not-found");
  assert.equal(await refusal("audio/.git/HEAD"), "not-found");
  assert.equal(await refusal(".thumbs/ShareX/backup.tar.gz.poster.webp"), "not-found");
  assert.equal(await refusal("ShareX/backup.tar.gz"), "not-found");
  assert.equal(await refusal("misc/notes.txt"), "ok");
  assert.equal(await refusal(".thumbs/audio/song.mp3.peaks.json"), "ok");
});

test("canRead lets the owner read a private file, asking once and only when needed", async () => {
  let asked = 0;
  const view = bucket().view(async () => {
    asked++;
    return true;
  });
  assert.deepEqual(await view.canRead("audio/song.mp3"), { ok: true, key: "audio/song.mp3", visibility: "listed" });
  assert.equal(asked, 0);
  assert.deepEqual(await view.canRead("ShareX/backup.tar.gz"), {
    ok: true,
    key: "ShareX/backup.tar.gz",
    visibility: "private",
  });
  await view.canRead("ShareX/backup.tar.gz");
  assert.equal(asked, 1);
});

test("a rules failure refuses reads and fails listings rather than showing everything", async () => {
  const failing = bucket({
    rules: async () => {
      throw new Error("D1 down");
    },
  });
  const decision = await failing.view(false).canRead("audio/song.mp3");
  assert.equal(decision.ok ? "ok" : decision.refusal, "unavailable");
  await assert.rejects(failing.view(false).tree(), /D1 down/);
  await assert.rejects(failing.view(false).listing(""), /D1 down/);
  await assert.rejects(failing.view(false).search("song"), /D1 down/);
  await assert.rejects(failing.publicSummary(), /D1 down/);
});

test("the public summary names only listed files and counts the rest as totals", async () => {
  const summary = await bucket().publicSummary();
  assert.deepEqual(paths(summary.tree).sort(), ["audio/", "audio/song.mp3"]);
  assert.deepEqual(summary.root?.folders, ["audio"]);
  assert.deepEqual(summary.hidden, { objects: 4, bytes: 40 });
  assert.ok(summary.ownerSlots >= 1);
});

test("past the tree cap the public summary has a listed root and no totals", async () => {
  const summary = await bucket({ inline: false }).publicSummary();
  assert.equal(summary.tree, null);
  assert.deepEqual(summary.root, { folders: ["audio"], files: [] });
  assert.equal(summary.hidden, null);
});
