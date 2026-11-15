import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BAND_COVER_SHOWN,
  COVER_TEXELS_PER_SIDE,
  coverTexels,
  MARK_ROWS,
  MARK_SIDES,
  ROW,
  placeCover,
  placeMark,
  triangleTaps,
} from "./geometry.ts";

const CELL = 24;

/** A lattice vertex on row `row` sits at a whole number of sides, less half a side per row. */
const onVertex = (x: number, row: number) => {
  const sides = x / CELL + row / 2;
  return Math.abs(sides - Math.round(sides)) < 1e-9;
};

test("the mark's top-left corner lands on a lattice vertex at every scale", () => {
  for (const width of [300, 470, 700, 1000, 1440, 2200]) {
    const mark = placeMark({ w: width, h: 600 }, CELL, { share: 0.5, alignX: 1, alignY: 0.5, inset: 20 });
    const scale = mark.w / (MARK_SIDES * CELL);
    const row = Math.round(mark.y / (CELL * ROW));
    assert.equal(Number.isInteger(scale), true);
    // The top edge starts a side and a half (in the mark's own triangles) in.
    assert.equal(onVertex(mark.x + 1.5 * scale * CELL, row), true, `width ${width}`);
    assert.equal(Math.abs(mark.h - MARK_ROWS * scale * CELL * ROW) < 1e-9, true);
  }
});

test("the mark stays inside the field", () => {
  const field = { w: 470, h: 230 };
  const mark = placeMark(field, 17, { share: 0.5, alignX: 1, alignY: 0, inset: 26 });
  assert.equal(mark.x >= 0 && mark.x + mark.w <= field.w, true);
  assert.equal(mark.y >= 0 && mark.y + mark.h <= field.h, true);
});

test("a field too small for the mark still gets it at one cell per triangle", () => {
  const mark = placeMark({ w: 100, h: 100 }, CELL, { share: 0.5, alignX: 1, alignY: 0 });
  assert.equal(mark.w, MARK_SIDES * CELL);
});

test("a wide field hangs the cover off its far edge", () => {
  const field = { w: 1440, h: 840 };
  const cover = placeCover(field, "wide");
  assert.equal(cover.w, cover.h);
  assert.equal(cover.x + cover.w, field.w);
  assert.equal(cover.w <= field.h, true);
});

test("a narrow field runs the cover edge to edge across the top", () => {
  assert.deepEqual(placeCover({ w: 390, h: 1000 }, "narrow"), { x: 0, y: 0, w: 390, h: 390 });
});

test("a title band crops its cover to the middle strip, ending on the frame", () => {
  const field = { w: 1440, h: 290 };
  const inset = 150;
  const cover = placeCover(field, "band", inset);
  assert.equal(cover.w, cover.h);
  assert.equal(cover.x + cover.w, field.w - inset);
  assert.equal(Math.abs(field.h / cover.h - BAND_COVER_SHOWN) < 1e-9, true);
  // Centred, so the band shows the same amount above and below the middle.
  assert.equal(Math.abs(cover.y + cover.h / 2 - field.h / 2) < 1e-9, true);
});

test("a band too narrow for the strip keeps its cover clear of the title", () => {
  const field = { w: 800, h: 360 };
  const inset = 22;
  const cover = placeCover(field, "band", inset);
  assert.equal(Math.abs(cover.w - (field.w - inset * 2) * 0.7) < 1e-9, true);
  assert.equal(cover.x + cover.w, field.w - inset);
  // Narrower than the strip would be, so more of the cover's height shows.
  assert.equal(field.h / cover.h > BAND_COVER_SHOWN, true);
});

test("a triangle's taps are its sub-triangles' centroids, n squared of them, inside it", () => {
  for (const n of [1, 2, 3, 4]) {
    const taps = triangleTaps(n);
    assert.equal(taps.length, n * n);
    for (const tap of taps) {
      assert.equal(Math.abs(tap[0] + tap[1] + tap[2] - 1) < 1e-12, true);
      assert.equal(Math.min(...tap) > 0, true);
    }
    assert.equal(new Set(taps.map((tap) => tap.map((w) => w.toFixed(9)).join())).size, n * n);
    // Equal areas: the taps' mean is the triangle's centroid.
    for (const corner of [0, 1, 2]) {
      const mean = taps.reduce((sum, tap) => sum + tap[corner]!, 0) / taps.length;
      assert.equal(Math.abs(mean - 1 / 3) < 1e-12, true);
    }
  }
});

test("the taps' mean is close to a curved picture's mean over the triangle", () => {
  const corners = [
    [0, 0],
    [1, 0],
    [0.5, ROW],
  ] as const;
  const f = (x: number, y: number) => x * x + 3 * y;
  const at = (w: readonly number[]) => {
    const x = w[0]! * corners[0][0] + w[1]! * corners[1][0] + w[2]! * corners[2][0];
    const y = w[0]! * corners[0][1] + w[1]! * corners[1][1] + w[2]! * corners[2][1];
    return f(x, y);
  };
  // The true mean, by brute force over a fine grid of barycentric points.
  let sum = 0;
  let count = 0;
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; i + j <= steps; j++) {
      sum += at([i / steps, j / steps, 1 - (i + j) / steps]);
      count++;
    }
  }
  const truth = sum / count;
  const taps = triangleTaps(3);
  const estimate = taps.reduce((total, tap) => total + at(tap), 0) / taps.length;
  assert.equal(Math.abs(estimate - truth) < 0.01, true, `${estimate} vs ${truth}`);
});

test("a cover's texture has a fixed number of texels to a triangle's side", () => {
  // At least a few texels to a side, rounded up to a step so a resize does not redraw it every frame.
  assert.equal(coverTexels({ x: 0, y: 0, w: 806, h: 806 }, 24), 144);
  assert.ok(144 >= (806 / 24) * COVER_TEXELS_PER_SIDE);
  assert.equal(coverTexels({ x: 0, y: 0, w: 812, h: 812 }, 24), 144);
  // Twice the cell, half the texels: the triangle's share stays the same.
  assert.equal(coverTexels({ x: 0, y: 0, w: 960, h: 960 }, 48) * 2, coverTexels({ x: 0, y: 0, w: 960, h: 960 }, 24));
  assert.equal(coverTexels({ x: 0, y: 0, w: 1, h: 1 }, 24), 16);
  assert.equal(coverTexels({ x: 0, y: 0, w: 1e5, h: 1e5 }, 24), 512);
});
