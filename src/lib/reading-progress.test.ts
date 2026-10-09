import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { activeHeading, readingProgress } from "./reading-progress.ts";

describe("active heading", () => {
  test("none while above the first heading", () => {
    assert.equal(activeHeading([300, 900, 1500], 100), -1);
  });

  test("the last heading to pass the threshold", () => {
    assert.equal(activeHeading([-400, 80, 700], 100), 1);
    assert.equal(activeHeading([-900, -300, 100], 100), 2);
  });

  test("a heading exactly at the threshold counts", () => {
    assert.equal(activeHeading([100, 500], 100), 0);
  });

  test("no headings, nothing active", () => {
    assert.equal(activeHeading([], 100), -1);
    assert.equal(activeHeading([], 100, true), -1);
  });

  test("at the end of the body, the last heading wins", () => {
    assert.equal(activeHeading([-900, 300, 600], 100, true), 2);
  });
});

describe("reading progress", () => {
  test("0 before the body reaches the top of the viewport", () => {
    assert.equal(readingProgress(240, 3000, 800), 0);
  });

  test("proportional through the travel", () => {
    assert.equal(readingProgress(-1100, 3000, 800), 0.5);
  });

  test("1 once the bottom is in view, and clamped past it", () => {
    assert.equal(readingProgress(-2200, 3000, 800), 1);
    assert.equal(readingProgress(-2600, 3000, 800), 1);
  });

  test("a body shorter than the viewport is read once its top is", () => {
    assert.equal(readingProgress(40, 500, 800), 0);
    assert.equal(readingProgress(0, 500, 800), 1);
  });
});
