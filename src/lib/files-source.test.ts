import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { R2Listing, R2Tree } from "./r2.ts";
import { createFilesSource, type FilesSourceOptions } from "./files-source.ts";

const VISITOR_TREE: R2Tree = {
  "": { folders: ["audio"], files: [["key.asc", 600, 100]] },
  "audio/": { folders: [], files: [["mix.mp3", 4000, 300]] },
};

const OWNER_TREE: R2Tree = {
  "": { folders: ["audio", "secret"], files: [["key.asc", 600, 100]] },
  "audio/": { folders: [], files: [["mix.mp3", 4000, 300]] },
  "secret/": { folders: [], files: [["diary.txt", 10, 500]] },
};

const ROOT: R2Listing = VISITOR_TREE[""];
const RULES = { "": "listed", "secret/": "private" } as const;

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** A fetch that answers by path and records every call. */
function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const path = url.split("?")[0];
    const route = routes[path];
    if (!route) throw new Error(`unexpected fetch ${url}`);
    return route(url, init);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function source(options: Partial<FilesSourceOptions> & Pick<FilesSourceOptions, "fetch">) {
  const published: R2Tree[] = [];
  const settled: boolean[] = [];
  const files = createFilesSource({
    tree: null,
    initial: null,
    bucketUrl: "https://upload.example",
    publish: (tree) => published.push(tree),
    onSettled: (p) => settled.push(p),
    searchDelayMs: 0,
    ...options,
  });
  return { files, published, settled };
}

const signal = () => new AbortController().signal;

describe("a visitor", () => {
  test("gets the listings the island shipped", async () => {
    const { fetch, calls } = fakeFetch({ "/api/files/visibility": () => json({ owner: false }) });
    const { files, published, settled } = source({ fetch, tree: VISITOR_TREE });
    assert.equal(files.getSnapshot().listing("audio/"), VISITOR_TREE["audio/"]);
    await files.checkAccess();
    const view = files.getSnapshot();
    assert.equal(view.owner, false);
    assert.equal(view.rules, null);
    assert.equal(view.accessChecked, true);
    assert.equal(view.listing("secret/"), undefined);
    assert.equal(view.tagFor("audio/mix.mp3"), null);
    assert.equal(view.baseFor("audio/mix.mp3"), "https://upload.example");
    assert.deepEqual(published, []);
    assert.deepEqual(settled, [false]);
    assert.deepEqual(calls, ["GET /api/files/visibility"]);
  });

  test("in lazy mode starts from the shipped root", () => {
    const { fetch } = fakeFetch({});
    const { files } = source({ fetch, initial: ROOT });
    assert.equal(files.getSnapshot().listing(""), ROOT);
    assert.equal(files.getSnapshot().rootError, false);
    assert.equal(files.getSnapshot().stats, null);
  });
});

describe("the owner upgrade", () => {
  test("swaps in the owner's tree and rules, and publishes the tree", async () => {
    const { fetch } = fakeFetch({
      "/api/files/visibility": () => json({ owner: true, rules: RULES, tree: OWNER_TREE }),
    });
    const { files, published, settled } = source({ fetch, tree: VISITOR_TREE });
    let notified = 0;
    files.subscribe(() => notified++);
    await files.checkAccess();
    const view = files.getSnapshot();
    assert.equal(view.owner, true);
    assert.deepEqual(view.rules, RULES);
    assert.deepEqual(view.listing("secret/"), OWNER_TREE["secret/"]);
    assert.equal(view.stats?.[""].objects, 3);
    assert.equal(view.tagFor("secret/diary.txt"), "private");
    assert.equal(view.baseFor("secret/diary.txt"), "");
    assert.deepEqual(published, [OWNER_TREE]);
    assert.deepEqual(settled, [true]);
    assert.ok(notified > 0);
  });

  test("lets a deep link into an owner-only folder resolve after it", async () => {
    const { fetch } = fakeFetch({
      "/api/files/visibility": () => json({ owner: true, rules: RULES, tree: OWNER_TREE }),
    });
    const { files } = source({ fetch, tree: VISITOR_TREE });
    assert.equal(files.getSnapshot().locate("secret/", "secret/diary.txt"), null);
    await files.checkAccess();
    assert.deepEqual(files.getSnapshot().locate("secret/", "secret/diary.txt"), {
      prefix: "secret/",
      file: "secret/diary.txt",
    });
    assert.deepEqual(files.getSnapshot().locate("", "secret"), { prefix: "secret/", file: null });
  });

  test("in lazy mode drops the visitors' listings and publishes nothing", async () => {
    const { fetch } = fakeFetch({ "/api/files/visibility": () => json({ owner: true, rules: RULES, tree: null }) });
    const { files, published, settled } = source({ fetch, initial: ROOT });
    await files.checkAccess();
    assert.equal(files.getSnapshot().owner, true);
    assert.equal(files.getSnapshot().listing(""), undefined);
    assert.deepEqual(published, []);
    assert.deepEqual(settled, [false]);
  });

  test("runs once however often it is asked", async () => {
    const { fetch, calls } = fakeFetch({ "/api/files/visibility": () => json({ owner: false }) });
    const { files, settled } = source({ fetch, tree: VISITOR_TREE });
    await Promise.all([files.checkAccess(), files.checkAccess()]);
    await files.checkAccess();
    assert.equal(calls.length, 1);
    assert.deepEqual(settled, [false]);
  });
});

describe("the hold settles, once, whatever the answer", () => {
  const answers: [string, Route][] = [
    ["owner: false", () => json({ owner: false })],
    ["an error status", () => json({ owner: true, error: "Unavailable" }, 502)],
    [
      "a fetch error",
      () => {
        throw new TypeError("offline");
      },
    ],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["owner without rules", () => json({ owner: true, tree: OWNER_TREE })],
    ["rules that are not an object", () => json({ owner: true, rules: "all", tree: OWNER_TREE })],
    ["null", () => json(null)],
  ];
  for (const [name, answer] of answers) {
    test(name, async () => {
      const { fetch } = fakeFetch({ "/api/files/visibility": answer });
      const { files, published, settled } = source({ fetch, tree: VISITOR_TREE });
      await files.checkAccess();
      assert.deepEqual(settled, [false]);
      assert.deepEqual(published, []);
      const view = files.getSnapshot();
      assert.equal(view.accessChecked, true);
      assert.equal(view.owner, false);
      assert.equal(view.listing("secret/"), undefined);
    });
  }

  test("after unmount too", async () => {
    const { fetch } = fakeFetch({ "/api/files/visibility": () => json({ owner: false }) });
    const { files, settled } = source({ fetch, tree: VISITOR_TREE });
    const check = files.checkAccess();
    files.dispose();
    await check;
    assert.deepEqual(settled, [false]);
    assert.equal(files.getSnapshot().accessChecked, false);
  });
});

describe("listings", () => {
  test("lazy mode fetches a folder once and keeps it", async () => {
    const { fetch, calls } = fakeFetch({ "/api/files/list": () => json(VISITOR_TREE["audio/"]) });
    const { files } = source({ fetch, initial: ROOT });
    await Promise.all([files.load("audio/"), files.load("audio/")]);
    await files.load("audio/");
    await files.load("");
    assert.deepEqual(calls, ["GET /api/files/list?prefix=audio%2F"]);
    assert.deepEqual(files.getSnapshot().listing("audio/"), VISITOR_TREE["audio/"]);
    assert.equal(files.getSnapshot().loading("audio/"), false);
  });

  test("a failed folder waits for a retry", async () => {
    let ok = false;
    const { fetch, calls } = fakeFetch({
      "/api/files/list": () => (ok ? json(VISITOR_TREE["audio/"]) : json({ error: true }, 500)),
    });
    const { files } = source({ fetch, initial: ROOT });
    await files.load("audio/");
    assert.equal(files.getSnapshot().failed("audio/"), true);
    await files.load("audio/");
    assert.equal(calls.length, 1);
    ok = true;
    await files.load("audio/", { retry: true });
    assert.equal(files.getSnapshot().failed("audio/"), false);
    assert.deepEqual(files.getSnapshot().listing("audio/"), VISITOR_TREE["audio/"]);
  });

  test("a listing that says error is a failure, not an empty folder", async () => {
    const { fetch } = fakeFetch({ "/api/files/list": () => json({ folders: [], files: [], error: true }) });
    const { files } = source({ fetch, initial: null });
    assert.equal(files.getSnapshot().rootError, true);
    await files.load("");
    assert.equal(files.getSnapshot().listing(""), undefined);
    assert.equal(files.getSnapshot().failed(""), true);
    assert.equal(files.getSnapshot().rootError, true);
  });

  test("the root arriving clears the root error", async () => {
    const { fetch } = fakeFetch({ "/api/files/list": () => json(ROOT) });
    const { files } = source({ fetch, initial: null });
    await files.load("");
    assert.equal(files.getSnapshot().rootError, false);
  });

  test("a visitor's folder landing after the owner upgrade is dropped", async () => {
    let finish!: () => void;
    const { fetch } = fakeFetch({
      "/api/files/list": () => new Promise<Response>((resolve) => (finish = () => resolve(json(ROOT)))),
      "/api/files/visibility": () => json({ owner: true, rules: RULES }),
    });
    const { files } = source({ fetch, initial: null });
    const visitorLoad = files.load("");
    await files.checkAccess();
    finish();
    await visitorLoad;
    assert.equal(files.getSnapshot().listing(""), undefined);
  });

  test("complete mode derives every listing from the tree without a fetch", async () => {
    const { fetch, calls } = fakeFetch({});
    const { files } = source({ fetch, tree: VISITOR_TREE });
    await files.load("audio/");
    await files.load("nowhere/");
    assert.deepEqual(calls, []);
    const view = files.getSnapshot();
    assert.equal(view.listing("audio/"), VISITOR_TREE["audio/"]);
    assert.deepEqual(view.stats?.["audio/"], { objects: 1, bytes: 4000, latest: 300 });
    assert.equal(view.locate("nowhere/", null), null);
  });
});

describe("search", () => {
  test("complete mode answers at once from the tree", () => {
    const { fetch, calls } = fakeFetch({});
    const { files } = source({ fetch, tree: VISITOR_TREE });
    const hits = files.search("mix", signal());
    assert.ok(Array.isArray(hits));
    assert.deepEqual(
      hits.map((e) => e.key),
      ["audio/mix.mp3"],
    );
    assert.deepEqual(calls, []);
  });

  test("complete mode searches the owner's tree once it has it", async () => {
    const { fetch } = fakeFetch({
      "/api/files/visibility": () => json({ owner: true, rules: RULES, tree: OWNER_TREE }),
    });
    const { files } = source({ fetch, tree: VISITOR_TREE });
    assert.deepEqual(files.search("diary", signal()), []);
    await files.checkAccess();
    assert.deepEqual(
      (files.search("diary", signal()) as { key: string }[]).map((e) => e.key),
      ["secret/diary.txt"],
    );
  });

  test("lazy mode asks the server", async () => {
    const { fetch, calls } = fakeFetch({
      "/api/files/search": () => json({ files: [["audio/mix.mp3", 4000, 300]] }),
    });
    const { files } = source({ fetch, initial: ROOT });
    const hits = files.search("mix", signal());
    assert.ok(hits instanceof Promise);
    const entries = await hits;
    assert.deepEqual(
      entries.map((e) => [e.key, e.folder, e.size]),
      [["audio/mix.mp3", "audio/", 4000]],
    );
    assert.deepEqual(calls, ["GET /api/files/search?q=mix"]);
  });

  test("lazy mode rejects a failed search", async () => {
    const { fetch } = fakeFetch({ "/api/files/search": () => json({ files: [], error: true }) });
    const { files } = source({ fetch, initial: ROOT });
    await assert.rejects(Promise.resolve(files.search("mix", signal())));
  });

  test("a superseded search never reaches the server", async () => {
    const { fetch, calls } = fakeFetch({ "/api/files/search": () => json({ files: [] }) });
    const { files } = source({ fetch, initial: ROOT, searchDelayMs: 50 });
    const controller = new AbortController();
    const hits = Promise.resolve(files.search("mi", controller.signal));
    controller.abort();
    await assert.rejects(hits);
    assert.deepEqual(calls, []);
  });
});

describe("visibility changes", () => {
  test("a saved change replaces the rules", async () => {
    const next = { ...RULES, "audio/": "unlisted" };
    const { fetch, calls } = fakeFetch({
      "/api/files/visibility": (_url, init) =>
        init?.method === "POST" ? json({ rules: next }) : json({ owner: true, rules: RULES, tree: OWNER_TREE }),
    });
    const { files } = source({ fetch, tree: VISITOR_TREE });
    await files.checkAccess();
    await files.setVisibility("audio/", "unlisted");
    assert.deepEqual(files.getSnapshot().rules, next);
    assert.equal(files.getSnapshot().tagFor("audio/mix.mp3"), "unlisted");
    assert.equal(calls.at(-1), "POST /api/files/visibility");
  });

  test("a refused change throws and keeps the rules", async () => {
    const { fetch } = fakeFetch({
      "/api/files/visibility": (_url, init) =>
        init?.method === "POST" ? json({ error: "Write failed" }, 502) : json({ owner: true, rules: RULES }),
    });
    const { files } = source({ fetch, tree: VISITOR_TREE });
    await files.checkAccess();
    await assert.rejects(files.setVisibility("audio/", "private"));
    assert.deepEqual(files.getSnapshot().rules, RULES);
  });
});
