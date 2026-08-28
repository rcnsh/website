import { test } from "node:test";
import assert from "node:assert/strict";
import { nextAllowedAt, WINDOW_MS } from "./rate-limit.ts";

const NOW = new Date("2026-08-29T12:00:00.000Z");

test("a first-time signer may post", () => {
  assert.equal(nextAllowedAt(null, NOW), null);
  assert.equal(nextAllowedAt(undefined, NOW), null);
});

test("a signer within the window is held off until it closes", () => {
  const lastPosted = new Date("2026-08-29T09:30:00.000Z");
  const next = nextAllowedAt(lastPosted, NOW);

  assert.ok(next);
  assert.equal(next.toISOString(), "2026-08-30T09:30:00.000Z");
});

test("a signer past the window may post again", () => {
  const lastPosted = new Date(NOW.getTime() - WINDOW_MS - 1000);
  assert.equal(nextAllowedAt(lastPosted, NOW), null);
});

test("the window is exclusive at its far edge", () => {
  // Exactly 24h later is allowed; a millisecond short of it is not.
  assert.equal(nextAllowedAt(new Date(NOW.getTime() - WINDOW_MS), NOW), null);

  const justShort = new Date(NOW.getTime() - WINDOW_MS + 1);
  assert.ok(nextAllowedAt(justShort, NOW));
});

test("an imported entry from years ago never blocks a signer", () => {
  assert.equal(nextAllowedAt(new Date("2024-03-13T15:13:00.000Z"), NOW), null);
});
