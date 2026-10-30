import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { CACHE_SECONDS, END_RETRIES, END_RETRY_MS, PLAY_SETTLE_MS, PLAYED_REFRESH_MS, type NowPlayingPayload } from "./now-playing.ts";
import { createNowPlaying, type EdgeCache, type NowPlayingReads } from "./now-playing-state.ts";
import type { RecentTrack } from "./spotify-reads.ts";
import { WarehouseShapeError } from "./warehouse-client.ts";

const ORIGIN = "https://rcn.sh";

const track = { title: "Song", artists: "Band", album: "LP", image: null, url: "https://open.spotify.com/track/x" };
const playing = { isPlaying: true as const, ...track, progressMs: 60_000, durationMs: 200_000 };
const recent: RecentTrack = { ...track, durationMs: 200_000, playedAt: "2026-10-30T10:00:00.000Z" };

/** A colo cache over a Map, a clock the test moves, and recorded timers. */
function harness(reads: Partial<NowPlayingReads> = {}) {
  let clock = 1_000_000;
  const entries = new Map<string, Response>();
  const deletes: number[] = [];
  const sleeps: { ms: number; wake: () => void }[] = [];
  const background: Promise<unknown>[] = [];
  const calls = { live: 0 };

  const edge: EdgeCache = {
    async match(key) {
      return entries.get(key.url)?.clone();
    },
    async put(key, response) {
      entries.set(key.url, response);
    },
    async delete(key) {
      deletes.push(clock);
      return entries.delete(key.url);
    },
  };

  const state = createNowPlaying({
    cache: async () => edge,
    reads: {
      live: async () => {
        calls.live++;
        return playing;
      },
      lastPlayed: async () => recent,
      stored: async () => null,
      ...reads,
    },
    now: () => clock,
    waitUntil: (promise) => {
      background.push(promise);
    },
    sleep: (ms) =>
      new Promise((resolve) => {
        sleeps.push({ ms, wake: () => resolve() });
      }),
  });

  return {
    ...state,
    entries,
    deletes,
    sleeps,
    calls,
    advance(ms: number) {
      clock += ms;
    },
    /** Fires the pending timers, moving the clock past them first. */
    async elapse() {
      for (const { ms, wake } of sleeps.splice(0)) {
        clock += ms;
        wake();
      }
      await Promise.all(background.splice(0));
    },
    /** One request, with its cache write finished; earlier timers stay pending. */
    async get() {
      const before = background.length;
      const response = await state.respond(ORIGIN);
      await Promise.all(background.splice(before));
      return { response, body: (await response.json()) as NowPlayingPayload & { progressMs?: number } };
    },
  };
}

describe("now-playing respond", () => {
  test("a miss reads live, stamps the copy and caches it", async () => {
    const h = harness();
    const { response, body } = await h.get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), `public, max-age=${CACHE_SECONDS}`);
    assert.equal(response.headers.get("x-cached-at"), "1000000");
    assert.deepEqual(body, { state: "playing", ...track, progressMs: 60_000, durationMs: 200_000 });
    assert.ok(h.entries.has(`${ORIGIN}/api/spotify/now-playing`));
  });

  test("a hit advances progress by the copy's age without another read", async () => {
    const h = harness();
    await h.get();
    h.advance(4_000);
    const { response, body } = await h.get();
    assert.equal(h.calls.live, 1);
    assert.equal(body.progressMs, 64_000);
    assert.equal(response.headers.get("cache-control"), `public, max-age=${CACHE_SECONDS}`);
  });

  test("a hit never runs progress past the duration", async () => {
    const h = harness();
    await h.get();
    h.advance(500_000);
    const { body } = await h.get();
    assert.equal(body.progressMs, 200_000);
  });

  test("a shape error reads as silence and falls back to last played", async () => {
    const h = harness({
      live: async () => {
        throw new WarehouseShapeError("/api/now-playing", new z.ZodError([]));
      },
    });
    const { body } = await h.get();
    assert.deepEqual(body, { state: "recent", ...track, playedAt: recent.playedAt });
  });

  test("last played failing falls back to stored, then to idle", async () => {
    const failing = async () => {
      throw new Error("down");
    };
    const stored = harness({ live: async () => ({ isPlaying: false }), lastPlayed: failing, stored: async () => recent });
    assert.equal((await stored.get()).body.state, "recent");

    const idle = harness({ live: async () => ({ isPlaying: false }), lastPlayed: failing });
    assert.deepEqual((await idle.get()).body, { state: "idle" });
  });

  test("a transport error is a 503 that is not cached", async () => {
    const h = harness({
      live: async () => {
        throw new Error("unreachable");
      },
    });
    const { response, body } = await h.get();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(body, { state: "error" });
    assert.equal(h.entries.size, 0);
  });
});

describe("now-playing invalidateAfterPlay", () => {
  test("drops the copy now and again after the warehouse settles", async () => {
    const h = harness();
    await h.get();
    await h.invalidateAfterPlay(ORIGIN);
    assert.equal(h.entries.size, 0);
    assert.equal(h.deletes.length, 1);

    // A poll inside the settle window caches what Spotify still reports.
    await h.get();
    assert.equal(h.entries.size, 1);
    assert.deepEqual(h.sleeps.map((s) => s.ms), [PLAY_SETTLE_MS]);
    await h.elapse();
    assert.equal(h.deletes.length, 2);
    assert.equal(h.deletes[1]! - h.deletes[0]!, PLAY_SETTLE_MS);
    assert.equal(h.entries.size, 0);
  });
});

describe("now-playing timings", () => {
  test("the client refreshes after the post-play invalidation", () => {
    assert.ok(PLAYED_REFRESH_MS > PLAY_SETTLE_MS);
  });

  test("end-of-track retries outlast one cache window", () => {
    assert.ok(END_RETRY_MS * END_RETRIES > CACHE_SECONDS * 1000);
  });
});
