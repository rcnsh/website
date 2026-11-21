import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentRange,
  corsHeaders,
  isRangeError,
  keyFromPath,
  parseOrigins,
  rangeOutcome,
  rangeToAsk,
  span,
  unsatisfiable,
  ifRangeHolds,
  readObject,
  type ReadableBucket,
} from "./bucket-http.ts";

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

test("a zero-byte suffix, or a bytes range on an empty object, is unsatisfiable; units are case-blind", () => {
  assert.equal(unsatisfiable("bytes=-0", 10), true);
  assert.equal(unsatisfiable("Bytes=-0", 10), true);
  assert.equal(unsatisfiable("bytes=0-", 0), true);
  assert.equal(unsatisfiable("bytes=-5", 10), false);
  assert.equal(unsatisfiable("bytes=-5", 0), true);
  assert.equal(unsatisfiable("BYTES=10-", 10), true);
});

test("a malformed, multi-part or other-unit range is ignored, even on an empty object", () => {
  for (const range of ["items=0-5", "bytes=abc", "bytes=0-1,4-5", "bytes=-"]) {
    assert.equal(unsatisfiable(range, 0), false, range);
    assert.deepEqual(rangeOutcome(range, { size: 0 }), { kind: "full" }, range);
  }
});

test("R2 is handed one valid bytes range, normalised, and nothing else", () => {
  const asked = (range: string | null) => rangeToAsk(range)?.get("range");
  assert.equal(asked("bytes=2-5"), "bytes=2-5");
  assert.equal(asked(" Bytes=2-"), "bytes=2-");
  assert.equal(asked("bytes=-3"), "bytes=-3");
  assert.equal(asked("bytes=0-99999999999999999999999"), "bytes=0-");
  assert.equal(asked("bytes=0-9007199254740991"), "bytes=0-");
  assert.equal(asked("bytes=-9007199254740991"), `bytes=-${2 ** 43}`);
  for (const range of [null, "bytes=3-1", "bytes=0-1,4-5", "items=0-5", "bytes=-", "bytes=abc", "bytes=-0", "bytes=99999999999999999999999-"]) {
    assert.equal(asked(range), undefined, String(range));
  }
});

test("a reversed range is ignored; a start past any size is refused", () => {
  assert.equal(unsatisfiable("bytes=10-5", 5), false);
  assert.deepEqual(rangeOutcome("bytes=10-5", { size: 5 }), { kind: "full" });
  assert.equal(unsatisfiable("bytes=99999999999999999999999-", 5), true);
  assert.equal(unsatisfiable("bytes=99999999999999999999999-5", 100), false);
  assert.deepEqual(rangeOutcome("bytes=99999999999999999999999-5", { size: 100 }), { kind: "full" });
});

test("rangeOutcome serves a span, refuses an empty one, and ignores a range R2 did not apply", () => {
  assert.deepEqual(rangeOutcome(null, { size: 10, range: { offset: 2 } }), { kind: "full" });
  assert.deepEqual(rangeOutcome("bytes=2-", { size: 10, range: { offset: 2 } }), {
    kind: "partial",
    span: { offset: 2, length: 8 },
  });
  assert.deepEqual(rangeOutcome("bytes=-0", { size: 10 }), { kind: "unsatisfiable", contentRange: "bytes */10" });
  assert.deepEqual(rangeOutcome("bytes=2-", { size: 10, range: { offset: 10 } }), {
    kind: "unsatisfiable",
    contentRange: "bytes */10",
  });
  assert.deepEqual(rangeOutcome("bytes=2-", { size: 10 }), { kind: "full" });
  assert.equal(span({ size: 10, range: { offset: 10 } }), null);
});

test("only R2's range refusal counts as a range error", () => {
  assert.equal(isRangeError(new Error("get: The requested range is not satisfiable (10039)")), true);
  assert.equal(isRangeError(new Error("internal error")), false);
  assert.equal(isRangeError(new Error("Value out of range")), false);
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

test("If-Range holds only for the object's strong ETag; a weak one or a date never does", () => {
  const object = { httpEtag: '"v2"' };
  assert.equal(ifRangeHolds(null, object), true);
  assert.equal(ifRangeHolds('"v2"', object), true);
  assert.equal(ifRangeHolds('"v1"', object), false);
  assert.equal(ifRangeHolds('W/"v2"', object), false);
  assert.equal(ifRangeHolds("Sat, 21 Nov 2026 10:00:00 GMT", object), false);
});

function fakeBucket(etag = '"v2"', content = "hello") {
  const calls: { range: string | null }[] = [];
  const stored = () => ({
    size: content.length,
    httpEtag: etag,
    uploaded: new Date(0),
    writeHttpMetadata: () => {},
  });
  const bucket: ReadableBucket & { calls: typeof calls; cancelled: number } = {
    calls,
    cancelled: 0,
    head: async () => stored(),
    get: async (_key, { range, onlyIf }) => {
      calls.push({ range: range?.get("range") ?? null });
      const parts = range?.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
      if (parts && parts[1] !== "" && Number(parts[1]) >= content.length) {
        throw new Error("get: The requested range is not satisfiable (10039)");
      }
      const match = onlyIf.get("if-none-match");
      if (match && match === etag) return stored();
      const ifMatch = onlyIf.get("if-match");
      if (ifMatch && ifMatch !== etag) return stored();
      const offset = parts ? Number(parts[1]) : undefined;
      const length = parts && parts[2] !== "" ? Number(parts[2]) - Number(parts[1]) + 1 : undefined;
      const bytes = parts ? content.slice(offset, length === undefined ? undefined : offset! + length) : content;
      const stream = new Blob([bytes]).stream();
      stream.cancel = async () => {
        bucket.cancelled++;
      };
      return { ...stored(), ...(parts ? { range: { offset, length } } : {}), body: stream };
    },
  };
  return bucket;
}

const headers = (init: Record<string, string>) => new Headers(init);

test("readObject serves a range when If-Range still names the object", async () => {
  const bucket = fakeBucket();
  const read = await readObject(bucket, "k", headers({ range: "bytes=1-2", "if-range": '"v2"' }));
  assert.equal(read.kind, "partial");
  assert.deepEqual(read.kind === "partial" && read.span, { offset: 1, length: 2 });
  assert.equal(bucket.calls.length, 1);
});

test("readObject serves the whole new object, never a slice, when If-Range is stale", async () => {
  const bucket = fakeBucket();
  const read = await readObject(bucket, "k", headers({ range: "bytes=1-2", "if-range": '"v1"' }));
  assert.equal(read.kind, "full");
  assert.deepEqual(bucket.calls, [{ range: "bytes=1-2" }, { range: null }]);
  assert.equal(bucket.cancelled, 1);
});

test("a stale If-Range turns an unsatisfiable range into the whole object, not a 416", async () => {
  for (const range of ["bytes=99-", "bytes=-0"]) {
    const bucket = fakeBucket();
    const read = await readObject(bucket, "k", headers({ range, "if-range": '"v1"' }));
    assert.equal(read.kind, "full", range);
    const fresh = await readObject(fakeBucket(), "k", headers({ range, "if-range": '"v2"' }));
    assert.equal(fresh.kind, "unsatisfiable", range);
  }
});

test("readObject answers failed conditions before looking at the range", async () => {
  const notModified = await readObject(fakeBucket(), "k", headers({ "if-none-match": '"v2"', range: "bytes=0-1" }));
  assert.equal(notModified.kind, "not-modified");
  const failed = await readObject(fakeBucket(), "k", headers({ "if-match": '"v1"' }));
  assert.equal(failed.kind, "precondition-failed");
  const missing = await readObject({ ...fakeBucket(), get: async () => null }, "k", headers({}));
  assert.equal(missing.kind, "missing");
});

test("a range R2 refuses still answers the request's conditions first, and names the size it refused", async () => {
  const conditions = [
    [{ "if-none-match": '"v2"' }, "not-modified"],
    [{ "if-match": '"v1"' }, "precondition-failed"],
  ] as const;
  for (const [init, kind] of conditions) {
    const read = await readObject(fakeBucket(), "k", headers({ ...init, range: "bytes=99-" }));
    assert.equal(read.kind, kind);
  }
  const bucket = fakeBucket();
  const refused = await readObject(bucket, "k", headers({ range: "bytes=99-" }));
  assert.deepEqual(refused, { kind: "unsatisfiable", contentRange: "bytes */5" });
  assert.equal(bucket.cancelled, 1);
});
