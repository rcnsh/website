import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeCursor, listUrl } from "./guestbook-cache.ts";

const ORIGIN = "https://rcn.sh";

test("the edge key is the route's, from the re-encoded cursor", () => {
  assert.equal(listUrl(ORIGIN, decodeCursor("junk")), `${ORIGIN}/api/guestbook/list`);
  assert.equal(listUrl(ORIGIN, decodeCursor("12:3")), `${ORIGIN}/api/guestbook/list?after=12%3A3`);
});
