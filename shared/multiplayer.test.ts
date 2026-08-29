import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CURSOR_HZ,
  FLUSH_INTERVAL_MS,
  MAX_MESSAGES_PER_SECOND,
  SEND_INTERVAL_MS,
  SMOOTH_TAU_MS,
} from "./multiplayer.ts";

/*
  CURSOR_HZ is meant to be turned up and down freely — it is the one knob that
  decides what the feature costs. These check that turning it does not quietly
  produce a broken configuration, since the two halves it feeds are built and
  deployed separately and would not fail together.
*/

describe("cursor tuning", () => {
  test("the rate is sane", () => {
    assert.ok(CURSOR_HZ > 0 && CURSOR_HZ <= 120, `${CURSOR_HZ} Hz is not a rate`);
  });

  /*
    The budget is what the Worker drops messages against. If it ever sits below
    what clients actually send, every honest client silently loses positions
    and cursors stutter for reasons nothing reports.
  */
  test("the budget is above the rate clients actually send at", () => {
    const sendsPerSecond = 1000 / SEND_INTERVAL_MS;

    assert.ok(
      MAX_MESSAGES_PER_SECOND > sendsPerSecond,
      `budget ${MAX_MESSAGES_PER_SECOND}/s is under the ${sendsPerSecond.toFixed(1)}/s clients send`,
    );
  });

  /*
    The client paces off animation frames with a few milliseconds of slack, so
    a 144 Hz display lands above the nominal rate. The budget has to leave room
    for that, or high-refresh monitors get clipped.
  */
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
