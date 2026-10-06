import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  bucketSource,
  ReadBudgetExceeded,
  readMediaMeta,
  type RangeBucket,
  type ReadStats,
} from "./media-meta.ts";

/** A mono 16-bit PCM WAV of `seconds` of silence, built by hand. */
function wav(seconds: number, sampleRate = 8000): Uint8Array {
  const dataBytes = seconds * sampleRate * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

type Call = { key: string; offset: number; length: number };

/** R2's ranged `get`, over an in-memory object, recording every call. */
function fakeBucket(objects: Record<string, Uint8Array>) {
  const calls: Call[] = [];
  const bucket: RangeBucket = {
    async get(key, { range }) {
      calls.push({ key, ...range });
      const body = objects[key];
      if (!body) return null;
      const slice = body.slice(range.offset, range.offset + range.length);
      return { arrayBuffer: async () => slice.buffer };
    },
  };
  return { bucket, calls };
}

function sourceFor(
  bucket: RangeBucket,
  key: string,
  size: number,
  stats?: ReadStats,
  budget?: { reads: number; bytes: number },
) {
  return bucketSource(bucket, key, size, stats, budget);
}

describe("the R2 range-read adapter", () => {
  test("every read is a bounded range on the one key, never the whole object", async () => {
    const file = wav(30);
    const { bucket, calls } = fakeBucket({ "music/a.wav": file });

    const meta = await readMediaMeta(sourceFor(bucket, "music/a.wav", file.byteLength));

    assert.equal(meta.supported, true);
    assert.ok(calls.length > 0);
    for (const call of calls) {
      assert.equal(call.key, "music/a.wav");
      assert.ok(call.offset >= 0 && call.length > 0);
      assert.ok(call.offset + call.length <= file.byteLength, "read past the end");
    }
    const read = calls.reduce((sum, c) => sum + c.length, 0);
    assert.ok(read < file.byteLength / 10, `read ${read} of ${file.byteLength} bytes`);
  });

  test("reads the WAV header into metadata", async () => {
    const file = wav(4);
    const { bucket } = fakeBucket({ k: file });
    const meta = await readMediaMeta(sourceFor(bucket, "k", file.byteLength));

    assert.ok(meta.supported);
    assert.equal(meta.container, "WAVE");
    assert.equal(meta.duration, 4);
    assert.equal(meta.video, null);
    assert.deepEqual(meta.audio, { codec: "pcm-s16", channels: 1, sampleRate: 8000 });
    assert.equal(meta.tags.coverArt, false);
  });

  test("bytes that are not media are a clean unsupported, not an error", async () => {
    const text = new TextEncoder().encode("just some notes, not a container\n".repeat(20));
    const { bucket } = fakeBucket({ "notes.txt": text });
    assert.deepEqual(
      await readMediaMeta(sourceFor(bucket, "notes.txt", text.byteLength)),
      { supported: false },
    );
  });

  // The rule behind "loaders must throw": anything that looks like a result
  // gets cached for the life of the entry.
  test("a failing bucket rejects instead of resolving to unsupported", async () => {
    const bucket: RangeBucket = {
      get: async () => {
        throw new Error("R2 is down");
      },
    };
    await assert.rejects(readMediaMeta(sourceFor(bucket, "k", 1000)), /R2 is down/);
  });

  test("an object deleted mid-read rejects", async () => {
    const { bucket } = fakeBucket({});
    await assert.rejects(readMediaMeta(sourceFor(bucket, "gone.wav", 5000)), /disappeared/);
  });

  test("a short read rejects rather than handing Mediabunny truncated bytes", async () => {
    const file = wav(2);
    const bucket: RangeBucket = {
      get: async (_key, { range }) => {
        const slice = file.slice(range.offset, range.offset + range.length - 1);
        return { arrayBuffer: async () => slice.buffer };
      },
    };
    await assert.rejects(readMediaMeta(sourceFor(bucket, "k", file.byteLength)), /bytes for a/);
  });

  test("the read budget stops a file that would need scanning", async () => {
    const file = wav(2);
    const { bucket, calls } = fakeBucket({ k: file });
    const stats: ReadStats = { reads: 0, bytes: 0 };

    await assert.rejects(
      readMediaMeta(sourceFor(bucket, "k", file.byteLength, stats, { reads: 1, bytes: 1 << 20 })),
      ReadBudgetExceeded,
    );
    assert.equal(calls.length, 1, "no read past the budget reached the bucket");
    assert.ok(stats.reads > 1);
  });
});
