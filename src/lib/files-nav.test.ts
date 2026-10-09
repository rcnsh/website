import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { R2Tree } from "./r2.ts";
import {
  baseName,
  childOnPath,
  crumbs,
  folderOf,
  folderStats,
  formatDay,
  hashFor,
  kindTotals,
  listingEntries,
  matchRange,
  nextSort,
  parentOf,
  parseHash,
  searchTree,
  sortEntries,
} from "./files-nav.ts";

const TREE: R2Tree = {
  "": { folders: ["audio", "ShareX"], files: [["key.asc", 600, 100]] },
  "audio/": { folders: ["album"], files: [["mix.mp3", 4000, 300]] },
  "audio/album/": { folders: [], files: [["01.flac", 9000, 200], ["cover.jpeg", 50, 250]] },
  "ShareX/": { folders: [], files: [["clip 10.mp4", 7000, 400], ["clip 2.mp4", 7000, 50]] },
};

describe("path math", () => {
  test("parent, folder and base name", () => {
    assert.equal(parentOf("a/b/"), "a/");
    assert.equal(parentOf("a/"), "");
    assert.equal(parentOf(""), "");
    assert.equal(folderOf("a/b.txt"), "a/");
    assert.equal(folderOf("b.txt"), "");
    assert.equal(folderOf("a/b/"), "a/");
    assert.equal(baseName("a/b.txt"), "b.txt");
    assert.equal(baseName("a/b/"), "b");
    assert.equal(baseName(""), "");
  });

  test("crumbs walk down from the root", () => {
    assert.deepEqual(crumbs(""), []);
    assert.deepEqual(crumbs("a/b/"), [
      { name: "a", prefix: "a/" },
      { name: "b", prefix: "a/b/" },
    ]);
  });

  test("stepping out leaves the folder passed through selected", () => {
    assert.equal(childOnPath("a/b/c/", "a/"), "a/b/");
    assert.equal(childOnPath("a/b/", ""), "a/");
    assert.equal(childOnPath("a/", "a/"), null);
    assert.equal(childOnPath("x/", "a/"), null);
  });
});

describe("folder stats", () => {
  test("roll every file up into each ancestor", () => {
    const stats = folderStats(TREE);
    assert.deepEqual(stats[""], { objects: 6, bytes: 27650, latest: 400 });
    assert.deepEqual(stats["audio/"], { objects: 3, bytes: 13050, latest: 300 });
    assert.deepEqual(stats["audio/album/"], { objects: 2, bytes: 9050, latest: 250 });
  });

  test("entries carry their folder's rollup", () => {
    const entries = listingEntries("audio/", TREE["audio/"], folderStats(TREE));
    assert.equal(entries[0].dir, true);
    assert.equal(entries[0].key, "audio/album/");
    assert.equal(entries[0].count, 2);
    assert.equal(entries[0].size, 9050);
    assert.equal(entries[1].key, "audio/mix.mp3");
    assert.equal(entries[1].folder, "audio/");
  });

  test("without stats a folder's figures are unknown, not zero", () => {
    const [folder] = listingEntries("", TREE[""]);
    assert.equal(folder.size, null);
    assert.equal(folder.count, null);
  });
});

describe("sorting", () => {
  const entries = listingEntries("", TREE[""], folderStats(TREE)).concat(
    listingEntries("ShareX/", TREE["ShareX/"]),
  );
  const names = (sorted: { name: string }[]) => sorted.map((e) => e.name);

  test("folders first, names numeric and case-blind", () => {
    assert.deepEqual(names(sortEntries(entries, "name")), [
      "audio",
      "ShareX",
      "clip 2.mp4",
      "clip 10.mp4",
      "key.asc",
    ]);
  });

  test("reverse flips the order, not the grouping", () => {
    assert.deepEqual(names(sortEntries(entries, "name", true)), [
      "ShareX",
      "audio",
      "key.asc",
      "clip 10.mp4",
      "clip 2.mp4",
    ]);
  });

  test("size is largest first, ties broken by name", () => {
    assert.deepEqual(names(sortEntries(entries, "size")).slice(2), [
      "clip 2.mp4",
      "clip 10.mp4",
      "key.asc",
    ]);
  });

  test("date is newest first; unknown dates sort last both ways", () => {
    const mixed = listingEntries("", TREE[""]).concat(listingEntries("ShareX/", TREE["ShareX/"]));
    // Folders have no stats here, so their dates are unknown.
    assert.deepEqual(names(sortEntries(mixed, "date")), [
      "audio",
      "ShareX",
      "clip 10.mp4",
      "key.asc",
      "clip 2.mp4",
    ]);
    assert.deepEqual(names(sortEntries(mixed, "date", true)).slice(2), [
      "clip 2.mp4",
      "key.asc",
      "clip 10.mp4",
    ]);
  });

  test("does not mutate its input", () => {
    const before = names(entries);
    sortEntries(entries, "size", true);
    assert.deepEqual(names(entries), before);
  });

  test("s cycles name → size → date", () => {
    assert.equal(nextSort("name"), "size");
    assert.equal(nextSort("size"), "date");
    assert.equal(nextSort("date"), "name");
  });
});

describe("search", () => {
  test("matches anywhere in the full key, case-blind", () => {
    assert.deepEqual(
      searchTree(TREE, "SHAREX").map((e) => e.key),
      ["ShareX/clip 10.mp4", "ShareX/clip 2.mp4"],
    );
    assert.deepEqual(
      searchTree(TREE, "album/0").map((e) => e.key),
      ["audio/album/01.flac"],
    );
  });

  test("needs two characters", () => {
    assert.deepEqual(searchTree(TREE, " a "), []);
  });

  test("results know their folder", () => {
    const [hit] = searchTree(TREE, "cover");
    assert.equal(hit.folder, "audio/album/");
    assert.equal(hit.name, "cover.jpeg");
  });

  test("match ranges for highlighting", () => {
    assert.deepEqual(matchRange("Clip 10.mp4", "clip"), [0, 4]);
    assert.deepEqual(matchRange("Clip 10.mp4", " 10 "), [5, 7]);
    assert.equal(matchRange("Clip", "zz"), null);
    assert.equal(matchRange("Clip", ""), null);
  });
});

describe("per-type totals", () => {
  test("sum bytes and objects per kind, largest share first", () => {
    assert.deepEqual(kindTotals(TREE), [
      { kind: "video", objects: 2, bytes: 14000 },
      { kind: "audio", objects: 2, bytes: 13000 },
      { kind: "file", objects: 1, bytes: 600 },
      { kind: "image", objects: 1, bytes: 50 },
    ]);
  });
});

describe("deep links", () => {
  test("round-trip folders and files, spaces and all", () => {
    for (const path of ["", "audio/", "ShareX/clip 10.mp4", "a/b#c/d?.txt"]) {
      const parsed = parseHash(hashFor(path));
      const back = parsed.file ?? parsed.prefix;
      assert.equal(back, path);
    }
  });

  test("a file opens its folder", () => {
    assert.deepEqual(parseHash("#ShareX/clip%2010.mp4"), {
      prefix: "ShareX/",
      file: "ShareX/clip 10.mp4",
    });
  });

  test("anything that walks out of the bucket is the root", () => {
    for (const hash of ["#../x", "#a/../b/", "#a//b", "#%E0%A4%A", "#a/.."]) {
      assert.deepEqual(parseHash(hash), { prefix: "", file: null }, hash);
    }
  });
});

describe("formatDay", () => {
  test("is pinned to UTC, so the server and the browser agree", () => {
    // 23:30 UTC on 4 June is already 5 June east of Greenwich.
    assert.equal(formatDay(Date.UTC(2024, 5, 4, 23, 30) / 1000), "4 Jun 2024");
  });
});
