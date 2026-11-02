import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock } from "./clock.ts";

test("clock reads m:ss, h:mm:ss, and zero for nonsense", () => {
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(Number.NaN), "0:00");
  assert.equal(formatClock(-4), "0:00");
});
