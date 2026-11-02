import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cornerPosition, isCorner, projectedCorner, releaseVelocity } from "./pip-position.ts";

const viewport = { width: 1200, height: 800 };
const box = { width: 320, height: 180 };
const insets = { top: 70, right: 16, bottom: 16, left: 16 };

describe("projected corner", () => {
  test("a drop with no throw settles in the quadrant it was let go in", () => {
    assert.equal(projectedCorner({ x: 100, y: 100 }, { x: 0, y: 0 }, box, viewport), "top-left");
    assert.equal(projectedCorner({ x: 800, y: 500 }, { x: 0, y: 0 }, box, viewport), "bottom-right");
  });

  test("the box's centre decides, not its top-left", () => {
    // Top-left is left of centre, but most of the box is right of it.
    assert.equal(projectedCorner({ x: 500, y: 600 }, { x: 0, y: 0 }, box, viewport), "bottom-right");
  });

  test("a throw carries it past the middle", () => {
    assert.equal(projectedCorner({ x: 100, y: 500 }, { x: 2000, y: 0 }, box, viewport), "bottom-right");
    assert.equal(projectedCorner({ x: 800, y: 500 }, { x: 0, y: -1500 }, box, viewport), "top-right");
  });

  test("a gentle nudge does not", () => {
    assert.equal(projectedCorner({ x: 100, y: 500 }, { x: 200, y: 0 }, box, viewport), "bottom-left");
  });
});

describe("corner position", () => {
  test("each corner sits inside the insets", () => {
    assert.deepEqual(cornerPosition("top-left", box, viewport, insets), { x: 16, y: 70 });
    assert.deepEqual(cornerPosition("top-right", box, viewport, insets), { x: 864, y: 70 });
    assert.deepEqual(cornerPosition("bottom-left", box, viewport, insets), { x: 16, y: 604 });
    assert.deepEqual(cornerPosition("bottom-right", box, viewport, insets), { x: 864, y: 604 });
  });

  test("a box wider or taller than the room left is pinned to the top-left insets", () => {
    const small = { width: 300, height: 200 };
    assert.deepEqual(cornerPosition("bottom-right", { width: 400, height: 300 }, small, insets), { x: 16, y: 70 });
  });
});

describe("release velocity", () => {
  test("measured over the recent samples only", () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 500 },
      { x: 60, y: 20, t: 550 },
      { x: 110, y: 40, t: 600 },
    ];
    assert.deepEqual(releaseVelocity(samples), { x: 1000, y: 400 });
  });

  test("a pause before letting go reads as a drop", () => {
    assert.deepEqual(releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 300, y: 0, t: 400 }]), { x: 0, y: 0 });
  });

  test("no samples, no velocity", () => {
    assert.deepEqual(releaseVelocity([]), { x: 0, y: 0 });
  });
});

test("isCorner accepts only the four names", () => {
  assert.equal(isCorner("top-left"), true);
  assert.equal(isCorner("middle"), false);
  assert.equal(isCorner(null), false);
});
