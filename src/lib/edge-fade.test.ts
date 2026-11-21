import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { edgeFade } from "./edge-fade.ts";

const WIDE = 715;
const NARROW = 335;
const OVERFLOW = WIDE - NARROW;

describe("edge fade", () => {
  test("nothing overflows, nothing fades", () => {
    assert.deepEqual(edgeFade(0, 700, 700), { left: 0, right: 0 });
    assert.deepEqual(edgeFade(0, 300, 700), { left: 0, right: 0 });
  });

  test("at the left edge, only the right is cut", () => {
    assert.deepEqual(edgeFade(0, WIDE, NARROW), { left: 0, right: 32 });
  });

  test("at the right edge, only the left is cut", () => {
    assert.deepEqual(edgeFade(OVERFLOW, WIDE, NARROW), { left: 32, right: 0 });
  });

  test("in the middle, both edges are cut", () => {
    assert.deepEqual(edgeFade(OVERFLOW / 2, WIDE, NARROW), { left: 32, right: 32 });
  });

  test("a sub-pixel gap from an edge still counts as being at it", () => {
    assert.deepEqual(edgeFade(0.4, WIDE, NARROW), { left: 0, right: 32 });
    assert.deepEqual(edgeFade(OVERFLOW - 0.4, WIDE, NARROW), { left: 32, right: 0 });
  });

  test("a scroll position outside the range cannot invent a fade", () => {
    assert.deepEqual(edgeFade(-50, WIDE, NARROW), { left: 0, right: 32 });
    assert.deepEqual(edgeFade(9999, WIDE, NARROW), { left: 32, right: 0 });
  });

  test("the fade size is configurable", () => {
    assert.deepEqual(edgeFade(OVERFLOW / 2, WIDE, NARROW, 16), { left: 16, right: 16 });
  });
});
