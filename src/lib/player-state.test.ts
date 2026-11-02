import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { needsOwner, parseSavedPlayback } from "./player-state.ts";

const base = "https://rcn.sh/music";
const origins = ["https://rcn.sh", "https://upload.rcn.sh"];
const track = {
  key: "audio/song.flac",
  url: "https://upload.rcn.sh/audio/song.flac",
  title: "Song",
  kind: "audio",
};

const parse = (value: unknown) => parseSavedPlayback(JSON.stringify(value), base, origins);

describe("saved playback", () => {
  test("round-trips a well-formed entry", () => {
    assert.deepEqual(parse({ track, time: 42.5, paused: false }), { track, time: 42.5, paused: false });
  });

  test("a same-origin path is allowed: private files play through the site", () => {
    const own = { ...track, url: "/api/files/download?key=private%2Fa.mp3" };
    assert.equal(parse({ track: own, time: 0, paused: true })?.track.url, own.url);
  });

  test("a media URL from anywhere else is dropped", () => {
    assert.equal(parse({ track: { ...track, url: "https://evil.example/a.mp3" }, time: 0 }), null);
    assert.equal(parse({ track: { ...track, url: "javascript:alert(1)" }, time: 0 }), null);
  });

  test("a foreign poster is dropped but the track kept", () => {
    const saved = parse({ track: { ...track, kind: "video", poster: "https://evil.example/p.png" }, time: 1 });
    assert.equal(saved?.track.poster, undefined);
    assert.equal(saved?.track.kind, "video");
  });

  test("a poster drawn in the browser survives", () => {
    const poster = "data:image/webp;base64,AAAA";
    assert.equal(parse({ track: { ...track, poster }, time: 1 })?.track.poster, poster);
  });

  test("anything malformed is nothing", () => {
    assert.equal(parseSavedPlayback(null, base, origins), null);
    assert.equal(parseSavedPlayback("{", base, origins), null);
    assert.equal(parse({ track: { ...track, kind: "image" } }), null);
    assert.equal(parse({ track: { ...track, key: "" } }), null);
    assert.equal(parse({ time: 3 }), null);
  });

  test("bad times read as the start, and only an explicit false is playing", () => {
    const saved = parse({ track, time: Number.NaN, paused: "no" });
    assert.equal(saved?.time, 0);
    assert.equal(saved?.paused, true);
  });
});

describe("owner-only tracks", () => {
  test("a file played through the download route needs the owner", () => {
    assert.equal(needsOwner("/api/files/download?key=private%2Fa.mp3", base), true);
    assert.equal(needsOwner("https://rcn.sh/api/files/download?key=a", base), true);
  });

  test("a file on the bucket does not", () => {
    assert.equal(needsOwner(track.url, base), false);
    assert.equal(needsOwner("/api/files/downloads", base), false);
  });
});
