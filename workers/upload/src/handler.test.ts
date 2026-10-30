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
