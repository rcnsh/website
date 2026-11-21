import assert from "node:assert/strict";
import { test } from "node:test";

import { applyTone, TONE, gammaForMean, percentile, toneCurve, toneMap } from "./tone.ts";

const level = (tone: number) => Math.floor(tone * 4.999);
const mean = (values: ArrayLike<number>) => Array.from(values).reduce((a, b) => a + b, 0) / values.length;

test("percentile interpolates between ranks", () => {
  assert.equal(percentile([0, 10, 20, 30, 40], 0.5), 20);
  assert.equal(percentile([0, 10], 0.25), 2.5);
  assert.equal(percentile([7], 0.98), 7);
});

test("one bright pixel no longer pushes a dark cover into the bottom levels", () => {
  const cover = Array.from({ length: 1000 }, (_, i) => 10 + (i % 50));
  cover[0] = 255;
  const levels = new Set(Array.from(toneMap(cover), level));
  assert.deepEqual([...levels].sort(), [0, 1, 2, 3, 4]);

  const old = cover.slice(1).map((lum) => level((lum - 10) / 245));
  assert.equal(Math.max(...old), 0);
});

test("a dark cover is lifted towards the target mean", () => {
  const cover = Array.from({ length: 900 }, (_, i) => ((i % 30) / 29) ** 4 * 210);
  const tones = toneMap(cover);
  const stretched = cover.map((lum) => lum / Math.max(...cover));
  assert.equal(mean(tones) > mean(stretched), true);
  assert.equal(Math.abs(mean(tones) - TONE.mean) < 0.01, true);
});

test("a cover with its own highlights is lifted less than one without", () => {
  const shadows = Array.from({ length: 600 }, (_, i) => (i % 60) / 2);
  const spread = [...shadows, ...Array.from({ length: 300 }, (_, i) => 30 + (i * 225) / 299)];
  const blocky = [...shadows, ...Array.from({ length: 300 }, () => 255)];
  const gammaOf = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const black = percentile(sorted, TONE.low);
    const white = percentile(sorted, TONE.high);
    const stretched = values.map((v) => Math.min(Math.max((v - black) / (white - black), 0), 1));
    return gammaForMean(stretched, TONE.mean, TONE.minGamma, TONE.maxGamma);
  };
  assert.equal(gammaOf(blocky) > gammaOf(spread), true);
});

test("the gamma stays within its bounds", () => {
  assert.equal(gammaForMean([0.01, 0.02], 0.4, 0.4, 1.25), 0.4);
  assert.equal(gammaForMean([0.99, 1], 0.4, 0.4, 1.25), 1.25);
  const g = gammaForMean([0.1, 0.3, 0.5, 0.7, 0.9], 0.45, 0.4, 1.25);
  assert.equal(Math.abs(mean([0.1, 0.3, 0.5, 0.7, 0.9].map((v) => v ** g)) - 0.45) < 1e-4, true);
});

test("tones stay in 0..1 and keep the order of their luminances", () => {
  const cover = Array.from({ length: 500 }, (_, i) => (i * 37) % 256);
  const tones = toneMap(cover);
  for (let i = 0; i < cover.length; i++) {
    assert.equal(tones[i]! >= 0 && tones[i]! <= 1, true);
    for (const j of [0, 99, 250]) if (cover[i]! < cover[j]!) assert.equal(tones[i]! <= tones[j]!, true);
  }
});

test("a flat cover keeps its real brightness", () => {
  const black = toneMap(Array.from({ length: 500 }, (_, i) => (i % 7 === 0 ? 3 : 1)));
  assert.ok(Math.max(...black) < 0.02, `black cover reached ${Math.max(...black)}`);
  const white = toneMap([250, 252, 251, 250]);
  assert.ok(Math.min(...white) > 0.95);
  assert.equal(toneMap([]).length, 0);
});

test("grain in a black background is not lifted a level", () => {
  const lums = Array.from({ length: 1000 }, (_, i) => (i % 5 === 0 ? 150 + (i % 90) : 2 + (i % 6)));
  const out = toneMap(lums);
  const background = Array.from(out).filter((_, i) => i % 5 !== 0);
  assert.ok(Math.max(...background) < 0.1, `background reached ${Math.max(...background)}`);
  assert.ok(Math.max(...out) > 0.9);
});

test("a curve measured on a small copy maps a large copy to the same tones", () => {
  const large = Array.from({ length: 4096 }, (_, i) => 8 + 60 * Math.sin(i / 300) ** 2 + (i % 97 === 0 ? 200 : 0));
  const small = large.filter((_, i) => i % 4 === 0);
  const fromSmall = toneCurve(small);
  const fromLarge = toneCurve(large);
  for (const lum of [10, 30, 50, 68]) {
    assert.equal(Math.abs(applyTone(lum, fromSmall) - applyTone(lum, fromLarge)) < 0.02, true);
  }
  assert.deepEqual(Array.from(toneMap(large)), Array.from(Float32Array.from(large, (lum) => applyTone(lum, fromLarge))));
});
