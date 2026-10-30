import { test } from "node:test";
import assert from "node:assert/strict";
import { json, policies, privateJson } from "./http.ts";

// Every public route's Cache-Control. A change here changes what a route tells
// browsers and the edge, so it should show up in review as a change to this.
test("each route's policy", () => {
  assert.deepEqual(
    {
      nowPlaying: policies.nowPlaying,
      nowSvg: policies.nowSvg,
      files: policies.files,
      guestbookList: policies.guestbookList,
      download: policies.download,
      thumbObject: policies.thumbObject,
      shellFs: policies.shellFs,
      topShort: policies.top("short_term"),
      topMedium: policies.top("medium_term"),
      topLong: policies.top("long_term"),
    },
    {
      nowPlaying: "public, max-age=10",
      nowSvg: "public, max-age=30, stale-while-revalidate=60",
      files: "public, max-age=60",
      guestbookList: "public, max-age=60",
      download: "public, max-age=3600",
      thumbObject: "public, max-age=86400",
      shellFs: "public, max-age=3600",
      topShort: "public, max-age=3600",
      topMedium: "public, max-age=21600",
      topLong: "public, max-age=86400",
    },
  );
});

test("json sets a cache-control only when given a policy", async () => {
  const plain = json({ a: 1 });
  assert.equal(plain.status, 200);
  assert.equal(plain.headers.get("content-type"), "application/json");
  assert.equal(plain.headers.has("cache-control"), false);
  assert.deepEqual(await plain.json(), { a: 1 });

  const shaped = json({}, { status: 404, policy: "no-store", headers: { vary: "cookie" } });
  assert.equal(shaped.status, 404);
  assert.equal(shaped.headers.get("cache-control"), "no-store");
  assert.equal(shaped.headers.get("vary"), "cookie");
});

test("privateJson is never cacheable", () => {
  const response = privateJson({ error: "x" }, 400);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
