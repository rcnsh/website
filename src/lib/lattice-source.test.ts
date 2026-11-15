import assert from "node:assert/strict";
import { test } from "node:test";
import { coverCaption } from "./lattice-source.ts";

test("the caption names the mark when there is no cover", () => {
  assert.equal(coverCaption(null), "the rcn mark");
});

test("the caption tells a live cover from the last one played", () => {
  const cover = { image: "https://i.scdn.co/image/x", label: "Trench, Twenty One Pilots" };
  assert.equal(coverCaption({ ...cover, live: true }), "what's playing now: Trench, Twenty One Pilots");
  assert.equal(coverCaption({ ...cover, live: false }), "the last thing played: Trench, Twenty One Pilots");
});
