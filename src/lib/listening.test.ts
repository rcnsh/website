import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarise } from "./listening.ts";

const play = (title: string, credits: string[], playedAt: string, url: string | null = `u:${title}`) => ({
  title,
  artists: credits.join(", "),
  playedAt,
  url,
  credits: credits.map((name) => ({ id: `id:${name}`, name })),
});

describe("listening summary", () => {
  test("an empty window has nothing to say", () => {
    assert.deepEqual(summarise([]), { plays: 0, tracks: 0, artists: 0, top: null, since: null });
  });

  test("repeats count as plays, not as tracks", () => {
    const s = summarise([
      play("Apricots", ["Bicep"], "2026-10-09T10:00:00.000Z"),
      play("Apricots", ["Bicep"], "2026-10-09T09:00:00.000Z"),
      play("Glue", ["Bicep"], "2026-10-09T08:00:00.000Z"),
    ]);
    assert.equal(s.plays, 3);
    assert.equal(s.tracks, 2);
    assert.equal(s.since, "2026-10-09T08:00:00.000Z");
  });

  test("features count toward their lead artist", () => {
    const s = summarise([
      play("Saku", ["Bicep", "Clara La San"], "2026-10-09T10:00:00.000Z"),
      play("Atlas", ["Bicep"], "2026-10-09T09:00:00.000Z"),
      play("Baby", ["Four Tet", "Ellie Goulding"], "2026-10-09T08:00:00.000Z"),
    ]);
    assert.equal(s.artists, 2);
    assert.deepEqual(s.top, { name: "Bicep", plays: 2 });
  });

  test("a name containing the separator is not split into two artists", () => {
    const s = summarise([
      play("See You Again", ["Tyler, The Creator", "Kali Uchis"], "2026-10-09T10:00:00.000Z"),
      play("EARFQUAKE", ["Tyler, The Creator"], "2026-10-09T09:00:00.000Z"),
    ]);
    assert.equal(s.artists, 1);
    assert.deepEqual(s.top, { name: "Tyler, The Creator", plays: 2 });
  });

  test("tracks without a link fall back to title and credit", () => {
    const s = summarise([
      play("A", ["X"], "2026-10-09T10:00:00.000Z", null),
      play("A", ["X"], "2026-10-09T09:00:00.000Z", null),
      play("A", ["Y"], "2026-10-09T08:00:00.000Z", null),
    ]);
    assert.equal(s.tracks, 2);
  });

  test("an artist without an id is counted by name", () => {
    const exported = (title: string) => ({ ...play(title, [], "2026-10-09T10:00:00.000Z"), credits: [{ id: null, name: "Bicep" }] });
    const s = summarise([exported("Apricots"), exported("Glue"), play("Baby", ["Four Tet"], "2026-10-09T08:00:00.000Z")]);
    assert.equal(s.artists, 2);
    assert.deepEqual(s.top, { name: "Bicep", plays: 2 });
  });

  test("a play with no credits counts as a play but not toward an artist", () => {
    const s = summarise([play("Unknown", [], "2026-10-09T10:00:00.000Z")]);
    assert.equal(s.plays, 1);
    assert.equal(s.artists, 0);
    assert.equal(s.top, null);
  });
});
