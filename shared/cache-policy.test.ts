import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noStore,
  privateNoStore,
  publicFor,
  serverIslands,
  staticAssets,
  uncachedError,
} from "./cache-policy.ts";

test("publicFor orders max-age, s-maxage, then stale-while-revalidate", () => {
  assert.equal(publicFor(60), "public, max-age=60");
  assert.equal(publicFor(30, { swr: 60 }), "public, max-age=30, stale-while-revalidate=60");
  assert.equal(publicFor(0, { edge: 600 }), "public, max-age=0, s-maxage=600");
});

// Each of these is a header some response carries today; a change here is a
// change to what browsers and the edge are told.
test("the named policies", () => {
  assert.equal(noStore, "no-store");
  assert.equal(uncachedError, "no-store");
  assert.equal(privateNoStore, "private, no-store");
  assert.equal(serverIslands, "public, max-age=60, s-maxage=300, stale-while-revalidate=3600");
  assert.equal(staticAssets, "public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
});
