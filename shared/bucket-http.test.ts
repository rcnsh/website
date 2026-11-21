import { test } from "node:test";
import assert from "node:assert/strict";
import { contentRange, corsHeaders, isRangeError, keyFromPath, parseOrigins, span, unsatisfiable } from "./bucket-http.ts";

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

test("a zero-byte suffix, or any range on an empty object, is unsatisfiable", () => {
  assert.equal(unsatisfiable("bytes=-0", 10), true);
  assert.equal(unsatisfiable("bytes=0-", 0), true);
  assert.equal(unsatisfiable("bytes=-5", 10), false);
});

test("only R2's range refusal counts as a range error", () => {
  assert.equal(isRangeError(new Error("get: The requested range is not satisfiable (10039)")), true);
  assert.equal(isRangeError(new Error("internal error")), false);
});

test("span reads a suffix range as the last bytes of the object", () => {
  assert.deepEqual(span({ size: 1000, range: { offset: undefined, length: undefined, suffix: 100 } }), {
    offset: 900,
    length: 100,
  });
  assert.deepEqual(span({ size: 50, range: { suffix: 100 } }), { offset: 0, length: 50 });
});

test("span reads a closed range and an open-ended one", () => {
  assert.deepEqual(span({ size: 1000, range: { offset: 10, length: 20, suffix: undefined } }), {
    offset: 10,
    length: 20,
  });
  assert.deepEqual(span({ size: 1000, range: { offset: 400 } }), { offset: 400, length: 600 });
  assert.deepEqual(span({ size: 1000, range: { offset: 990, length: 50 } }), { offset: 990, length: 10 });
});

test("span is null without a range", () => {
  assert.equal(span({ size: 1000 }), null);
});

test("contentRange names the inclusive byte span and the total", () => {
  assert.equal(contentRange({ offset: 900, length: 100 }, 1000), "bytes 900-999/1000");
});
