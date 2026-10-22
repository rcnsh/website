import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPlainClick, isTrackId, trackIdFromHref } from "./track-play.ts";

const ID = "6PCUP3dWmTjcTtXY02oFdT";

describe("track play", () => {
  test("reads the id from a track link, with or without a query", () => {
    assert.equal(trackIdFromHref(`https://open.spotify.com/track/${ID}`), ID);
    assert.equal(trackIdFromHref(`https://open.spotify.com/track/${ID}?si=abc`), ID);
  });

  test("ignores anything that is not one track", () => {
    assert.equal(trackIdFromHref(`https://open.spotify.com/artist/${ID}`), null);
    assert.equal(trackIdFromHref(`https://open.spotify.com/track/${ID}x`), null);
    assert.equal(trackIdFromHref(`https://evil.test/?u=https://open.spotify.com/track/${ID}`), null);
  });

  test("checks ids", () => {
    assert.equal(isTrackId(ID), true);
    assert.equal(isTrackId(`spotify:track:${ID}`), false);
    assert.equal(isTrackId(42), false);
  });

  test("leaves modified clicks to the browser", () => {
    const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    assert.equal(isPlainClick(plain), true);
    assert.equal(isPlainClick({ ...plain, metaKey: true }), false);
    assert.equal(isPlainClick({ ...plain, button: 1 }), false);
  });
});
