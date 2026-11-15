import assert from "node:assert/strict";
import { test } from "node:test";

import { MARK_ROWS, MARK_SIDES, ROW, placeCover, placeMark } from "./geometry.ts";

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
  const cover = placeCover(field, false);
  assert.equal(cover.w, cover.h);
  assert.equal(cover.x + cover.w, field.w);
  assert.equal(cover.w <= field.h, true);
});

test("a narrow field runs the cover edge to edge across the top", () => {
  assert.deepEqual(placeCover({ w: 390, h: 1000 }, true), { x: 0, y: 0, w: 390, h: 390 });
});
