import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isHiddenKey,
  publicUrl,
  isThumbKind,
  isVisibleKey,
  parsePeaksSidecar,
  parseStripSidecar,
  thumbKey,
  thumbPartProblem,
  thumbSet,
  THUMB_KINDS,
} from "./thumbs.ts";

const webp = (extra = 0) => {
  const bytes = new Uint8Array(32 + extra);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBPVP8 "), 8);
  return bytes;
};
const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("thumbs route key validation", () => {
  test("a visible source key maps under .thumbs/", () => {
    assert.equal(thumbKey("video/clip.mp4", "poster.webp"), ".thumbs/video/clip.mp4.poster.webp");
    assert.equal(thumbKey("a.flac", "peaks.json"), ".thumbs/a.flac.peaks.json");
  });

  test("every accepted target starts with .thumbs/", () => {
    for (const kind of Object.keys(THUMB_KINDS)) {
      if (!isThumbKind(kind)) assert.fail(kind);
      assert.ok(thumbKey("x/y.mp4", kind)?.startsWith(".thumbs/"));
    }
  });

  const refused: [string, string][] = [
    ["empty", ""],
    ["traversal", "../secret.mp4"],
    ["traversal mid-path", "video/../../etc.mp4"],
    ["a dot segment", "video/./clip.mp4"],
    ["leading slash", "/clip.mp4"],
    ["trailing slash", "video/"],
    ["empty segment", "video//clip.mp4"],
    ["a hidden file", ".env"],
    ["a hidden folder", "video/.private/clip.mp4"],
    ["a thumb of a thumb", ".thumbs/clip.mp4.poster.webp"],
    ["a control character", "clip\n.mp4"],
    ["a NUL", "clip\u0000.mp4"],
    ["too long for R2 once prefixed", `${"a".repeat(1010)}.mp4`],
  ];
  for (const [what, key] of refused) {
    test(`refuses ${what}`, () => {
      assert.equal(isVisibleKey(key), false);
      assert.equal(thumbKey(key, "poster.webp"), null);
    });
  }

  test("dots inside a name are fine; only a leading dot hides", () => {
    assert.ok(isVisibleKey("v1.2/clip.final.mp4"));
    assert.ok(isVisibleKey("music/Artist - Song (Live).flac"));
    assert.ok(isHiddenKey(".thumbs/x.png"));
    assert.ok(!isHiddenKey("x.thumbs/png"));
  });

  test("only the four preview files are kinds", () => {
    assert.ok(isThumbKind("poster.webp"));
    assert.ok(isThumbKind("peaks.json"));
    assert.ok(!isThumbKind("poster.png"));
    assert.ok(!isThumbKind("../poster.webp"));
    assert.ok(!isThumbKind("constructor"));
    assert.ok(!isThumbKind("__proto__"));
  });
});

describe("thumb parts", () => {
  test("accepts a real WebP and a JSON object", () => {
    assert.equal(thumbPartProblem("poster.webp", "image/webp", webp()), null);
    assert.equal(thumbPartProblem("peaks.json", "application/json; charset=utf-8", json({ peaks: [1, 2] })), null);
  });

  test("the declared type must match the kind", () => {
    assert.match(thumbPartProblem("poster.webp", "image/png", webp()) ?? "", /must be image\/webp/);
    assert.match(thumbPartProblem("strip.json", "text/html", json({})) ?? "", /must be application\/json/);
  });

  test("the bytes must match the declared type", () => {
    const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0);
    assert.match(thumbPartProblem("poster.webp", "image/webp", png) ?? "", /not a WebP/);
    assert.match(
      thumbPartProblem("peaks.json", "application/json", new TextEncoder().encode("<script>")) ?? "",
      /not valid JSON/,
    );
    assert.match(thumbPartProblem("peaks.json", "application/json", json([1, 2])) ?? "", /JSON object/);
  });

  test("size is capped per kind", () => {
    const cap = THUMB_KINDS["poster.webp"].maxBytes;
    assert.equal(thumbPartProblem("poster.webp", "image/webp", webp(cap - 32)), null);
    assert.match(thumbPartProblem("poster.webp", "image/webp", webp(cap - 31)) ?? "", /over/);
    assert.match(thumbPartProblem("poster.webp", "image/webp", new Uint8Array(0)) ?? "", /empty/);
  });

  test("a strip counts only with its sidecar", () => {
    assert.deepEqual(thumbSet(["poster.webp", "strip.webp"]), { poster: true, strip: false, peaks: false });
    assert.deepEqual(thumbSet(["strip.json", "strip.webp", "peaks.json"]), { poster: false, strip: true, peaks: true });
  });
});

describe("public URLs", () => {
  test("encode each segment but keep the slashes", () => {
    assert.equal(publicUrl("https://upload.rcn.sh", "a b/c#d.mp4"), "https://upload.rcn.sh/a%20b/c%23d.mp4");
  });

  test("fall back to the download route without a public domain", () => {
    assert.equal(publicUrl("", "a b/c.mp4"), "/api/files/download?key=a%20b%2Fc.mp4");
  });
});

describe("sidecars", () => {
  const strip = { version: 1, frames: 2, columns: 2, tileWidth: 160, tileHeight: 90, timestamps: [1, 3] };

  test("a well-formed strip sidecar parses", () => {
    assert.deepEqual(parseStripSidecar(strip), strip);
  });

  test("a strip whose timestamps disagree with its frame count is refused", () => {
    assert.equal(parseStripSidecar({ ...strip, timestamps: [1] }), null);
    assert.equal(parseStripSidecar({ ...strip, version: 2 }), null);
    assert.equal(parseStripSidecar({ ...strip, columns: 0 }), null);
    assert.equal(parseStripSidecar(null), null);
  });

  test("peaks must be 0..255 integers over a positive duration", () => {
    assert.ok(parsePeaksSidecar({ version: 1, duration: 3, peaks: [0, 128, 255] }));
    assert.equal(parsePeaksSidecar({ version: 1, duration: 3, peaks: [256] }), null);
    assert.equal(parsePeaksSidecar({ version: 1, duration: 0, peaks: [1] }), null);
    assert.equal(parsePeaksSidecar({ version: 1, duration: 3, peaks: [] }), null);
  });
});
