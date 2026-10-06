import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  accumulatePeaks,
  dequantizePeaks,
  fitBox,
  frameAt,
  posterTimestamp,
  quantizePeaks,
  spriteCell,
  spriteLayout,
  stripTimestamps,
} from "./preview-math.ts";

describe("sprite layout", () => {
  const tile = { width: 160, height: 90 };

  test("24 frames fill a 6 by 4 sheet exactly", () => {
    const layout = spriteLayout(24, tile);
    assert.equal(layout.columns, 6);
    assert.equal(layout.rows, 4);
    assert.equal(layout.width, 960);
    assert.equal(layout.height, 360);
  });

  test("a partial last row still gets a row", () => {
    const layout = spriteLayout(7, tile, 3);
    assert.equal(layout.rows, 3);
    assert.deepEqual(spriteCell(layout, 6), { x: 0, y: 180 });
  });

  test("fewer frames than columns makes a single row that wide", () => {
    const layout = spriteLayout(2, tile);
    assert.equal(layout.columns, 2);
    assert.equal(layout.width, 320);
  });

  test("cells run row-major and clamp to the sheet", () => {
    const layout = spriteLayout(24, tile);
    assert.deepEqual(spriteCell(layout, 0), { x: 0, y: 0 });
    assert.deepEqual(spriteCell(layout, 5), { x: 800, y: 0 });
    assert.deepEqual(spriteCell(layout, 6), { x: 0, y: 90 });
    assert.deepEqual(spriteCell(layout, 23), { x: 800, y: 270 });
    assert.deepEqual(spriteCell(layout, 99), spriteCell(layout, 23));
    assert.deepEqual(spriteCell(layout, -3), spriteCell(layout, 0));
  });

  test("refuses a sheet WebP cannot encode", () => {
    assert.throws(() => spriteLayout(200, { width: 200, height: 200 }, 100), RangeError);
    assert.throws(() => spriteLayout(0, tile), RangeError);
  });

  test("the pointer maps onto frames edge to edge", () => {
    assert.equal(frameAt(0, 24), 0);
    assert.equal(frameAt(-1, 24), 0);
    assert.equal(frameAt(Number.NaN, 24), 0);
    assert.equal(frameAt(0.5, 24), 12);
    assert.equal(frameAt(0.999, 24), 23);
    assert.equal(frameAt(1, 24), 23);
    assert.equal(frameAt(7, 24), 23);
  });

  test("strip frames sit at slice midpoints, never on the very ends", () => {
    assert.deepEqual(stripTimestamps(0, 8, 4), [1, 3, 5, 7]);
    assert.deepEqual(stripTimestamps(2, 8, 2), [4, 8]);
  });

  test("the poster skips a fade-in but stays early in long files", () => {
    assert.equal(posterTimestamp(0, 30), 3);
    assert.equal(posterTimestamp(0, 3600), 10);
    assert.equal(posterTimestamp(1, 30), 4);
  });

  test("boxes keep the source aspect ratio inside the bound", () => {
    assert.deepEqual(fitBox({ width: 1920, height: 1080 }, { width: 160, height: 160 }), { width: 160, height: 90 });
    assert.deepEqual(fitBox({ width: 1080, height: 1920 }, { width: 160, height: 160 }), { width: 90, height: 160 });
    assert.deepEqual(fitBox({ width: 0, height: 0 }, { width: 160, height: 90 }), { width: 160, height: 90 });
  });

  test("a small source is never scaled up", () => {
    assert.deepEqual(fitBox({ width: 320, height: 180 }, { width: 640, height: 480 }), { width: 320, height: 180 });
  });
});

describe("peaks downsampler", () => {
  /** One chunk of a constant-amplitude square wave. */
  const chunk = (frames: number, amplitude: number) =>
    Float32Array.from({ length: frames }, (_, i) => (i % 2 ? -amplitude : amplitude));

  test("a whole signal in one chunk lands in the right bins", () => {
    const peaks = new Float32Array(4);
    // 4 seconds at 10 Hz: first half loud, second half quiet.
    const signal = new Float32Array(40);
    signal.set(chunk(20, 0.8), 0);
    signal.set(chunk(20, 0.2), 20);
    accumulatePeaks(peaks, [signal], 0, 10, 4);
    assert.deepEqual(Array.from(peaks, (p) => Math.round(p * 10) / 10), [0.8, 0.8, 0.2, 0.2]);
  });

  test("chunked input gives the same result as one buffer, in any order", () => {
    const sampleRate = 48000;
    const duration = 3;
    const whole = Float32Array.from({ length: sampleRate * duration }, (_, i) =>
      Math.sin(i / 50) * (i / (sampleRate * duration)),
    );

    const once = new Float32Array(1000);
    accumulatePeaks(once, [whole], 0, sampleRate, duration);

    const chunked = new Float32Array(1000);
    const size = 1152; // an MP3 frame, which does not divide a bin evenly
    const starts = [];
    for (let at = 0; at < whole.length; at += size) starts.push(at);
    for (const at of starts.reverse()) {
      accumulatePeaks(chunked, [whole.subarray(at, at + size)], at / sampleRate, sampleRate, duration);
    }

    assert.deepEqual(chunked, once);
  });

  test("takes the loudest channel, by absolute value", () => {
    const peaks = new Float32Array(1);
    accumulatePeaks(peaks, [Float32Array.of(0.1, 0.2), Float32Array.of(-0.9, 0.3)], 0, 2, 1);
    assert.ok(Math.abs(peaks[0] - 0.9) < 1e-6);
  });

  test("samples past the stated duration are dropped, not wrapped", () => {
    const peaks = new Float32Array(2);
    accumulatePeaks(peaks, [chunk(10, 0.5)], 1.5, 10, 2);
    assert.equal(Math.round(peaks[0] * 10), 0);
    assert.equal(Math.round(peaks[1] * 10), 5);
  });

  test("a negative start (an encoder delay) only fills the bins it reaches", () => {
    const peaks = new Float32Array(2);
    accumulatePeaks(peaks, [chunk(10, 0.5)], -0.5, 10, 2);
    assert.equal(Math.round(peaks[0] * 10), 5);
    assert.equal(peaks[1], 0);
  });

  test("degenerate input changes nothing", () => {
    const peaks = new Float32Array(3);
    accumulatePeaks(peaks, [], 0, 44100, 10);
    accumulatePeaks(peaks, [new Float32Array(0)], 0, 44100, 10);
    accumulatePeaks(peaks, [chunk(10, 1)], 0, 44100, 0);
    accumulatePeaks(peaks, [chunk(10, 1)], 0, 0, 10);
    assert.deepEqual(Array.from(peaks), [0, 0, 0]);
  });

  test("quantizing round-trips within a step and clamps clipping", () => {
    const values = quantizePeaks(Float32Array.of(0, 0.5, 1, 1.4, -0.2));
    assert.deepEqual(values, [0, 128, 255, 255, 0]);
    const back = dequantizePeaks(values);
    assert.ok(Math.abs(back[1] - 0.5) <= 1 / 255);
  });
});
