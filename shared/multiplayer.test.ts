import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_HZ,
  FLUSH_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
  SEND_INTERVAL_MS,
  SMOOTH_TAU_MS,
} from "./multiplayer.ts";

// CURSOR_HZ is meant to be turned freely. The two halves it feeds deploy
// separately, so a broken combination would not fail together.

describe("cursor tuning", () => {
  test("the rate is sane", () => {
    assert.ok(CURSOR_HZ > 0 && CURSOR_HZ <= 120, `${CURSOR_HZ} Hz is not a rate`);
  });

  // Below what clients send, every honest client silently loses positions.
  test("the budget is above the rate clients actually send at", () => {
    const sendsPerSecond = 1000 / SEND_INTERVAL_MS;

    assert.ok(
      MAX_MESSAGES_PER_SECOND > sendsPerSecond,
      `budget ${MAX_MESSAGES_PER_SECOND}/s is under the ${sendsPerSecond.toFixed(1)}/s clients send`,
    );
  });

  // Frame pacing plus slack puts a 144 Hz display above the nominal rate.
  test("the budget leaves headroom for a high-refresh display", () => {
    assert.ok(MAX_MESSAGES_PER_SECOND >= CURSOR_HZ * 1.2);
  });

  test("the room flushes at least as often as clients send", () => {
    assert.ok(
      FLUSH_INTERVAL_MS <= SEND_INTERVAL_MS + 5,
      "flushing slower than clients send throws away positions they paid to deliver",
    );
  });

  test("the send interval is never zero or negative", () => {
    assert.ok(SEND_INTERVAL_MS > 0);
  });

  test("smoothing is long enough to bridge a frame, short enough not to lag", () => {
    assert.ok(SMOOTH_TAU_MS > 0);
    // Below the interval there is nothing left to smooth; far above it the
    // cursor visibly trails the person moving it.
    assert.ok(SMOOTH_TAU_MS >= 1000 / CURSOR_HZ);
    assert.ok(SMOOTH_TAU_MS <= (1000 / CURSOR_HZ) * 3);
  });
});
