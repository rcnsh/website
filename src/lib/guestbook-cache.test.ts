import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeCursor,
  FIRST_PAGE_KEY,
  guestbookInvalidation,
  LIST_CACHE,
  listUrl,
  STATS_KEY,
} from "./guestbook-cache.ts";

const ORIGIN = "https://rcn.sh";

function recorder() {
  const calls = { kv: [] as string[][], edge: [] as [string, string][] };
  const invalidate = guestbookInvalidation({
    kv: async (...keys) => void calls.kv.push(keys),
    edge: async (name, url) => void calls.edge.push([name, url]),
  });
  return { calls, invalidate };
}

test("a write drops KV and this colo's edge copy of page 1", async () => {
  const { calls, invalidate } = recorder();
  await invalidate(ORIGIN);
  assert.deepEqual(calls.kv, [[FIRST_PAGE_KEY, STATS_KEY]]);
  assert.deepEqual(calls.edge, [[LIST_CACHE, `${ORIGIN}/api/guestbook/list`]]);
});

test("a deletion on a deep page drops that page's edge copy too", async () => {
  const { calls, invalidate } = recorder();
  await invalidate(ORIGIN, { createdAt: 1700000000, id: 42 });
  assert.deepEqual(calls.edge, [
    [LIST_CACHE, `${ORIGIN}/api/guestbook/list`],
    [LIST_CACHE, `${ORIGIN}/api/guestbook/list?after=1700000000%3A42`],
  ]);
});

test("the edge key is the route's, from the re-encoded cursor", () => {
  assert.equal(listUrl(ORIGIN, decodeCursor("junk")), `${ORIGIN}/api/guestbook/list`);
  assert.equal(listUrl(ORIGIN, decodeCursor("12:3")), `${ORIGIN}/api/guestbook/list?after=12%3A3`);
});
