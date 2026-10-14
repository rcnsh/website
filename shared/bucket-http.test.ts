import { test } from "node:test";
import assert from "node:assert/strict";
import { corsHeaders, keyFromPath, parseOrigins, unsatisfiable } from "./bucket-http.ts";

test("keyFromPath decodes each segment the way publicUrl encodes it", () => {
  assert.equal(keyFromPath("/Jacob%20Wiltshire_0xD6C31FE5_public.asc"), "Jacob Wiltshire_0xD6C31FE5_public.asc");
  assert.equal(keyFromPath("/audio/a%2Bb.mp3"), "audio/a+b.mp3");
});

test("keyFromPath refuses folders, the root, traversal and bad escapes", () => {
  assert.equal(keyFromPath("/"), null);
  assert.equal(keyFromPath("/audio/"), null);
  assert.equal(keyFromPath("/a/../b"), null);
  assert.equal(keyFromPath("/a/%2E%2E/b"), null);
  assert.equal(keyFromPath("/%E0%A4%A"), null);
});

test("CORS only for configured origins", () => {
  const allowed = parseOrigins(" https://rcn.sh , ");
  assert.deepEqual(allowed, ["https://rcn.sh"]);
  assert.equal(corsHeaders("https://evil.example", allowed), null);
  assert.equal(corsHeaders(null, allowed), null);
  assert.equal(corsHeaders("https://rcn.sh", allowed)?.["access-control-allow-origin"], "https://rcn.sh");
});

test("a range starting past the end is unsatisfiable; others are not", () => {
  assert.equal(unsatisfiable("bytes=999-1000", 10), true);
  assert.equal(unsatisfiable("bytes=10-", 10), true);
  assert.equal(unsatisfiable("bytes=9-", 10), false);
  assert.equal(unsatisfiable("bytes=-3", 10), false);
  assert.equal(unsatisfiable(null, 10), false);
});
