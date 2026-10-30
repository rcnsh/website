import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isTrackId, PLAY_SELECTOR, PLAY_TRACK_ATTR, playButtonAttributes } from "./track-play.ts";

const ID = "6PCUP3dWmTjcTtXY02oFdT";

describe("track play", () => {
  test("checks ids", () => {
    assert.equal(isTrackId(ID), true);
    assert.equal(isTrackId(`spotify:track:${ID}`), false);
    assert.equal(isTrackId(42), false);
  });

  test("the button carries the attribute the click handler selects on", () => {
    assert.equal(PLAY_SELECTOR, `button[${PLAY_TRACK_ATTR}]`);
    assert.deepEqual(playButtonAttributes(ID, "Song"), {
      "data-play-track": ID,
      "aria-label": "Play Song on Spotify",
      title: "Play on Spotify",
    });
  });
});
