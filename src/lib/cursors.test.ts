import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  approach,
  type Column,
  isStalled,
  onScreen,
  RECONNECT_MAX_MS,
  RECONNECT_MIN_MS,
  reconnectDelay,
  STALL_AFTER_ATTEMPTS,
  toColumn,
  toScreen,
} from "./cursors.ts";

/** A 768px column centred in a 1280px window, as the site lays out. */
const WIDE: Column = { left: 256, top: 100, width: 768 };
/** The same column on a narrow window, where it fills the screen bar padding. */
const NARROW: Column = { left: 20, top: 100, width: 335 };

describe("cursor space", () => {
  test("the centre of the column is the centre of the column", () => {
    assert.equal(toColumn({ x: 640, y: 100 }, WIDE).x, 0.5);
    assert.equal(toColumn({ x: 187.5, y: 100 }, NARROW).x, 0.5);
  });

  test("y is pixels below the column, not the page", () => {
    assert.equal(toColumn({ x: 640, y: 340 }, WIDE).y, 240);
  });

  /*
    The whole reason positions are sent in column space rather than as viewport
    fractions. Someone pointing a third of the way across the text should land
    a third of the way across the text for a reader at any window size — if
    this ever stops holding, cursors silently point at the wrong words.
  */
  test("a position means the same place at any window width", () => {
    const pointingAt = toColumn({ x: 256 + 768 / 3, y: 400 }, WIDE);
    const forNarrowReader = toScreen(pointingAt, NARROW, { x: 0, y: 0 });

    // Floating point, so a tolerance rather than equality — a third of a
    // column is not exactly representable either way round.
    assert.ok(Math.abs(forNarrowReader.x - (20 + 335 / 3)) < 1e-9);
    assert.ok(Math.abs(forNarrowReader.y - 400) < 1e-9);
  });

  test("round-trips through the same column", () => {
    const page = { x: 700, y: 512 };
    const there = toColumn(page, WIDE);
    const back = toScreen(there, WIDE, { x: 0, y: 0 });

    assert.ok(Math.abs(back.x - page.x) < 1e-9);
    assert.ok(Math.abs(back.y - page.y) < 1e-9);
  });

  test("scrolling moves a cursor with the document, not the viewport", () => {
    const at = toColumn({ x: 640, y: 900 }, WIDE);

    assert.equal(toScreen(at, WIDE, { x: 0, y: 0 }).y, 900);
    assert.equal(toScreen(at, WIDE, { x: 0, y: 400 }).y, 500);
  });

  test("the margins either side of the column are reachable", () => {
    // People do point at things beside the text; the Worker's clamp allows
    // roughly -1.5..2.5, so nothing in this range may be rejected here.
    assert.ok(toColumn({ x: 0, y: 0 }, WIDE).x < 0);
    assert.ok(toColumn({ x: 1280, y: 0 }, WIDE).x > 1);
  });
});

describe("culling", () => {
  const viewport = { width: 1280, height: 720 };

  test("keeps what is on screen", () => {
    assert.equal(onScreen({ x: 640, y: 360 }, viewport), true);
    assert.equal(onScreen({ x: 0, y: 0 }, viewport), true);
  });

  test("drops what is well outside it", () => {
    assert.equal(onScreen({ x: -400, y: 360 }, viewport), false);
    assert.equal(onScreen({ x: 640, y: 2000 }, viewport), false);
    assert.equal(onScreen({ x: 3000, y: 360 }, viewport), false);
    assert.equal(onScreen({ x: 640, y: -300 }, viewport), false);
  });

  test("keeps a cursor just off the left edge, whose label is not", () => {
    // The name sits to the right of the arrow, so an arrow at -60 still has
    // readable text on screen. Popping it out would be visible.
    assert.equal(onScreen({ x: -60, y: 360 }, viewport), true);
  });
});

describe("smoothing", () => {
  test("moves towards the target without overshooting", () => {
    const step = approach(0, 100, 16, 25);

    assert.ok(step > 0 && step < 100);
  });

  test("converges", () => {
    let at = 0;
    for (let i = 0; i < 200; i++) at = approach(at, 100, 16, 25);

    assert.ok(Math.abs(at - 100) < 0.001);
  });

  test("is framerate-independent", () => {
    // One 32ms frame should land in the same place as two 16ms ones, or a
    // cursor moves at a different speed depending on the reader's monitor.
    const oneBigStep = approach(0, 100, 32, 25);
    const twoSmallSteps = approach(approach(0, 100, 16, 25), 100, 16, 25);

    assert.ok(Math.abs(oneBigStep - twoSmallSteps) < 1e-9);
  });

  test("a zero time constant lands immediately, for reduced motion", () => {
    assert.equal(approach(0, 100, 16, 0), 100);
  });

  test("never moves backwards", () => {
    assert.ok(approach(100, 0, 16, 25) < 100);
    assert.ok(approach(100, 0, 16, 25) > 0);
  });
});

describe("reconnect backoff", () => {
  test("starts quickly", () => {
    assert.equal(reconnectDelay(0), RECONNECT_MIN_MS);
  });

  test("doubles", () => {
    assert.equal(reconnectDelay(1), 1000);
    assert.equal(reconnectDelay(2), 2000);
    assert.equal(reconnectDelay(3), 4000);
  });

  /*
    The bug this replaced: the ceiling was 15s, so a client whose room Worker
    was down knocked four times a minute for the life of the session, logging a
    failure and spending a request each time.
  */
  test("caps, so a dead server is not knocked at forever", () => {
    assert.equal(reconnectDelay(40), RECONNECT_MAX_MS);
    assert.ok(
      RECONNECT_MAX_MS >= 60_000,
      "a ceiling under a minute is still noisy",
    );
  });

  test("never returns something that would busy-loop", () => {
    for (let attempt = 0; attempt < 64; attempt++) {
      assert.ok(reconnectDelay(attempt) >= RECONNECT_MIN_MS);
    }
  });

  test("survives a nonsense attempt count", () => {
    assert.equal(reconnectDelay(-1), RECONNECT_MIN_MS);
  });
});

describe("stall reporting", () => {
  test("stays quiet through a blip", () => {
    assert.equal(isStalled(0), false);
    assert.equal(isStalled(1), false);
  });

  test("admits to an outage once the attempts add up", () => {
    assert.equal(isStalled(STALL_AFTER_ATTEMPTS + 1), true);
  });

  test("waits several seconds before crying wolf", () => {
    // Whatever the threshold is set to, it must not fire so early that a
    // momentary hiccup is shown to the reader as a broken feature.
    let elapsed = 0;
    for (let attempt = 0; attempt <= STALL_AFTER_ATTEMPTS; attempt++) {
      elapsed += reconnectDelay(attempt);
    }
    assert.ok(elapsed >= 5000, `stalls after only ${elapsed}ms`);
  });
});
