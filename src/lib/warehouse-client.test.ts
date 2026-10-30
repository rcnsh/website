import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { lastPlayed, nowPlaying, recentPlays, top } from "./spotify-reads.ts";
import { createWarehouse, WarehouseNotConfigured, WarehouseShapeError } from "./warehouse-client.ts";

const ENV = {
  MUSIC_WAREHOUSE_URL: "https://warehouse.example/",
  MUSIC_WAREHOUSE_TOKEN: "read-token",
  MUSIC_WAREHOUSE_CONTROL_TOKEN: "control-token",
};

/** A client over a fake transport that answers `body` and records every request. */
function fake(body: unknown, { env = ENV, status = 200 } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const cacheKeys: string[] = [];
  const client = createWarehouse({
    env,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    },
    cache: (key, _fresh, loader) => {
      cacheKeys.push(key);
      return loader();
    },
  });
  return { client, requests, cacheKeys };
}

const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

const row = (context_type: string | null, context_name: string | null) => ({
  played_at_ms: 0,
  track_id: "abc",
  track_name: "Song",
  context_type,
  context_name,
});

describe("warehouse client", () => {
  test("a bad shape throws instead of resolving", async () => {
    const { client } = fake({ plays: "nope" });
    await assert.rejects(client.read(recentPlays(5)), WarehouseShapeError);
  });

  test("now playing throws on a bad shape rather than reporting silence", async () => {
    const { client } = fake({ item: { item: { name: 42 } } });
    await assert.rejects(client.read(nowPlaying()), WarehouseShapeError);
  });

  test("a failed response throws", async () => {
    const { client } = fake({}, { status: 503 });
    await assert.rejects(client.read(recentPlays(5)), /re-authorisation/);
  });

  test("a read sends the read token and never the control token", async () => {
    const { client, requests } = fake({ plays: [] });
    await client.read(recentPlays(5));
    assert.equal(requests.length, 1);
    assert.equal(auth(requests[0].init), "Bearer read-token");
    assert.ok(!JSON.stringify(requests[0]).includes("control-token"));
  });

  test("a read without the read token refuses rather than borrowing the control token", async () => {
    const { client, requests } = fake({}, { env: { ...ENV, MUSIC_WAREHOUSE_TOKEN: "" } });
    await assert.rejects(client.read(recentPlays(5)), WarehouseNotConfigured);
    assert.equal(requests.length, 0);
  });

  test("play sends the control token to /control/play", async () => {
    const { client, requests } = fake({ ok: true });
    const response = await client.play("4uLU6hMCjMI75M1A2tKUQC");
    assert.equal(response.status, 200);
    assert.equal(requests.length, 1);
    const [{ url, init }] = requests;
    assert.equal(url, "https://warehouse.example/control/play");
    assert.equal(init.method, "POST");
    assert.equal(auth(init), "Bearer control-token");
    assert.deepEqual(JSON.parse(init.body as string), { track_id: "4uLU6hMCjMI75M1A2tKUQC" });
    assert.ok(!JSON.stringify(requests).includes("read-token"));
  });

  test("play without the control token refuses rather than borrowing the read token", async () => {
    const { client, requests } = fake({}, { env: { ...ENV, MUSIC_WAREHOUSE_CONTROL_TOKEN: "" } });
    await assert.rejects(client.play("x"), WarehouseNotConfigured);
    assert.equal(requests.length, 0);
  });

  test("a trailing slash on the base URL is dropped", async () => {
    for (const base of ["https://warehouse.example/", "https://warehouse.example"]) {
      const { client, requests } = fake({ plays: [] }, { env: { ...ENV, MUSIC_WAREHOUSE_URL: base } });
      await client.read(recentPlays(5));
      assert.equal(requests[0].url, "https://warehouse.example/api/plays?limit=5");
    }
  });

  test("cache keys are namespaced under warehouse:", async () => {
    const { client, cacheKeys } = fake({ ok: true });
    await client.read({ path: "/api/x", schema: z.object({ ok: z.boolean() }), cache: { key: "x", freshForSeconds: 1 } });
    await client.read({ path: "/api/y", schema: z.object({ ok: z.boolean() }) });
    assert.deepEqual(cacheKeys, ["warehouse:x"]);
  });
});

describe("recent plays", () => {
  test("playlist contexts stay private while album and artist contexts show", async () => {
    const { client, cacheKeys } = fake({
      plays: [row("album", "An Album"), row("artist", "An Artist"), row("playlist", "Secret Mix"), row(null, "Mystery")],
    });
    const plays = await client.read(recentPlays(4));
    assert.deepEqual(
      plays.map((p) => p.context),
      ["An Album", "An Artist", null, null],
    );
    assert.ok(!JSON.stringify(plays).includes("Secret Mix"));
    assert.deepEqual(cacheKeys, ["warehouse:recent:v4:4"]);
  });

  test("each play carries its track id", async () => {
    const { client } = fake({ plays: [row(null, null)] });
    const [play] = await client.read(recentPlays(1));
    assert.equal(play.trackId, "abc");
    assert.equal(play.url, "https://open.spotify.com/track/abc");
  });
});

describe("track ids on live reads", () => {
  test("now playing carries the track id", async () => {
    const { client } = fake({ item: { is_playing: true, progress_ms: 5, item: { id: "abc", name: "Song" } } });
    const playing = await client.read(nowPlaying());
    assert.ok(playing.isPlaying);
    assert.equal(playing.trackId, "abc");
  });

  test("last played carries the track id, and a local file has none", async () => {
    const played_at = "2026-01-01T00:00:00.000Z";
    const { client } = fake({ items: [{ played_at, track: { id: "abc", name: "Song" } }] });
    assert.equal((await client.read(lastPlayed()))?.trackId, "abc");
    const local = fake({ items: [{ played_at, track: { id: null, name: "Local" } }] });
    assert.equal((await local.client.read(lastPlayed()))?.trackId, null);
  });
});

describe("top", () => {
  const image = (width: number | null) => ({ url: `w${width}`, width });

  test("picks the smallest cover wide enough, else the first", async () => {
    const { client, cacheKeys } = fake({
      tracks: { items: [{ id: "abc", name: "T", artists: [{ name: "A" }, { name: "B" }], album: { images: [image(640), image(300), image(64)] } }] },
      artists: {
        items: [
          { name: "Wide", images: [image(640), image(320), image(160)] },
          { name: "Narrow", images: [image(160), image(64)] },
        ],
      },
    });
    const { tracks, artists } = await client.read(top("short_term", 2));
    assert.equal(tracks[0].image, "w300");
    assert.equal(tracks[0].artists, "A, B");
    assert.equal(tracks[0].trackId, "abc");
    assert.deepEqual(
      artists.map((a) => a.image),
      ["w320", "w160"],
    );
    assert.deepEqual(cacheKeys, ["warehouse:top:v2:short_term:2"]);
  });
});
