import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Env } from "./handler.ts";

const ROWS = [
  { prefix: "", visibility: "unlisted" },
  { prefix: "ShareX/", visibility: "private" },
];

function fakeEnv({ rows = ROWS, failRules = false } = {}) {
  const reads: string[] = [];
  const object = (key: string) => ({
    key,
    size: 5,
    uploaded: new Date(0),
    httpEtag: '"e"',
    body: new Blob(["hello"]).stream(),
    writeHttpMetadata: (headers: Headers) => headers.set("content-type", "text/plain"),
  });
  const env = {
    BUCKET: {
      head: async (key: string) => (reads.push(key), object(key)),
      get: async (key: string) => (reads.push(key), object(key)),
    },
    DB: {
      prepare: () => ({
        all: async () => {
          if (failRules) throw new Error("D1 down");
          return { results: rows };
        },
      }),
    },
  } as unknown as Env;
  return { env, reads };
}

const get = (env: Env, path: string, method = "GET") =>
  createHandler().fetch(new Request(`https://upload.rcn.sh${path}`, { method }), env);

test("answers a path that names no key with the shared bad-request refusal", async () => {
  const { env, reads } = fakeEnv();
  const response = await get(env, "/%E0");
  assert.equal(response.status, 400);
  assert.equal(reads.length, 0);
});

test("serves a public key", async () => {
  const { env } = fakeEnv();
  const response = await get(env, "/misc/notes.txt");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "hello");
});

test("refuses a private key, and its thumbs, as not found without touching the bucket", async () => {
  const { env, reads } = fakeEnv();
  for (const path of ["/ShareX/backup.tar.gz", "/.thumbs/ShareX/backup.tar.gz.poster.webp"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await get(env, path, method);
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  assert.deepEqual(reads, []);
});

test("refuses dot paths and traversal", async () => {
  const { env, reads } = fakeEnv();
  for (const path of ["/.env", "/a/.git/HEAD", "/a/%2E%2E/ShareX/backup.tar.gz"]) {
    assert.equal((await get(env, path)).status, 404, path);
  }
  assert.deepEqual(reads, []);
});

test("refuses everything while the rules cannot be read", async () => {
  const { env, reads } = fakeEnv({ failRules: true });
  const response = await get(env, "/misc/notes.txt");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(reads, []);
});

const ranged = (env: Env, path: string, range: string) =>
  createHandler().fetch(new Request(`https://upload.rcn.sh${path}`, { headers: { range } }), env);

test("a range R2 refuses is a 416 that names the size; any other R2 failure is not", async () => {
  const { env } = fakeEnv();
  const bucket = env.BUCKET as unknown as { get: (key: string) => Promise<unknown> };
  bucket.get = async () => {
    throw new Error("get: The requested range is not satisfiable (10039)");
  };
  const refused = await ranged(env, "/music/a.mp3", "bytes=999-");
  assert.equal(refused.status, 416);
  assert.equal(refused.headers.get("content-range"), "bytes */5");

  bucket.get = async () => {
    throw new Error("internal error");
  };
  await assert.rejects(Promise.resolve(ranged(env, "/music/a.mp3", "bytes=0-")).then((r) => {
    if (r.status >= 500) throw new Error(`status ${r.status}`);
    return r;
  }));
});

test("a zero-byte suffix range is a 416, not an empty 200", async () => {
  const { env } = fakeEnv();
  const response = await ranged(env, "/music/a.mp3", "bytes=-0");
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */5");
});

test("an empty span from R2 is a 416, and a refused range on a missing key is a 404", async () => {
  const { env } = fakeEnv();
  const bucket = env.BUCKET as unknown as {
    get: (key: string) => Promise<unknown>;
    head: (key: string) => Promise<unknown>;
  };
  const original = await bucket.get("music/a.mp3");
  bucket.get = async () => ({ ...(original as object), range: { offset: 5 } });
  const empty = await ranged(env, "/music/a.mp3", "Bytes=5-");
  assert.equal(empty.status, 416);
  assert.equal(empty.headers.get("content-range"), "bytes */5");
  assert.equal(empty.headers.get("cache-control"), "no-store");

  bucket.get = async () => {
    throw new Error("get: The requested range is not satisfiable (10039)");
  };
  bucket.head = async () => null;
  assert.equal((await ranged(env, "/music/gone.mp3", "bytes=9-")).status, 404);
});
