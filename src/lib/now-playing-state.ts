import { CACHE_SECONDS, PLAY_SETTLE_MS, type NowPlayingPayload } from "./now-playing.ts";
import type { NowPlaying, RecentTrack } from "./spotify-reads.ts";
import { WarehouseShapeError } from "./warehouse-client.ts";

/**
 * Freshness for `/api/spotify/now-playing`: one edge copy per colo, advanced
 * by its age on every hit, and dropped when the owner starts a track. Free of
 * `cloudflare:workers`; `./now-playing-server` binds it to the Worker.
 */

export type EdgeCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
  delete(key: Request): Promise<boolean>;
};

export type NowPlayingReads = {
  live: () => Promise<NowPlaying>;
  lastPlayed: () => Promise<RecentTrack | null>;
  /** Lags the warehouse's ingest cron, so only the last resort. */
  stored: () => Promise<RecentTrack | null>;
};

export type NowPlayingDeps = {
  cache: () => Promise<EdgeCache>;
  reads: NowPlayingReads;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
  sleep: (ms: number) => Promise<void>;
};

/** Stamped on the cached copy so a hit can tell how far the track has moved. */
const CACHED_AT = "x-cached-at";

const cacheKey = (origin: string) => new Request(`${origin}/api/spotify/now-playing`);

const headers = { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_SECONDS}` };

export function createNowPlaying({ cache, reads, now, waitUntil, sleep }: NowPlayingDeps) {
  async function read(): Promise<NowPlayingPayload> {
    // The read throws on a shape change so nothing caches it as silence; this
    // card still treats it as silence and falls back to last played.
    const current = await reads.live().catch((error): NowPlaying => {
      if (!(error instanceof WarehouseShapeError)) throw error;
      console.error("[music] now-playing shape changed, showing last played", error);
      return { isPlaying: false };
    });

    if (current.isPlaying) {
      const { title, artists, album, image, url, progressMs, durationMs } = current;
      return { state: "playing", title, artists, album, image, url, progressMs, durationMs };
    }

    const recent = await reads.lastPlayed().catch((error) => {
      console.error("[music] live last-played failed, using stored", error);
      return reads.stored();
    });
    if (!recent) return { state: "idle" };
    const { title, artists, album, image, url, playedAt } = recent;
    return { state: "recent", title, artists, album, image, url, playedAt };
  }

  /**
   * Rebuilt rather than returned, since a cached Response has immutable
   * headers, with progress advanced so the client's bar doesn't rewind.
   */
  async function fromCache(hit: Response): Promise<Response> {
    let payload = (await hit.json()) as NowPlayingPayload;
    const cachedAt = Number(hit.headers.get(CACHED_AT));
    if (payload.state === "playing" && Number.isFinite(cachedAt)) {
      payload = { ...payload, progressMs: Math.min(payload.progressMs + (now() - cachedAt), payload.durationMs) };
    }
    return new Response(JSON.stringify(payload), { headers });
  }

  return {
    /** The route's whole answer; the response is the same for every visitor. */
    async respond(origin: string): Promise<Response> {
      const edge = await cache();
      const key = cacheKey(origin);
      const hit = await edge.match(key);
      if (hit) return fromCache(hit);

      try {
        const response = new Response(JSON.stringify(await read()), {
          headers: { ...headers, [CACHED_AT]: String(now()) },
        });
        waitUntil(edge.put(key, response.clone()));
        return response;
      } catch (error) {
        console.error("[music] now-playing failed", error);
        // Not cached: a transient upstream failure shouldn't outlive itself. A
        // 5xx, so the client keeps its last good card instead of replacing it.
        return new Response(JSON.stringify({ state: "error" } satisfies NowPlayingPayload), {
          status: 503,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
    },

    /**
     * After the owner starts a track: the copy names the old one for up to a
     * window. Dropped again once the warehouse has refetched, in case a poll
     * in between cached what Spotify had not yet caught up on.
     */
    async invalidateAfterPlay(origin: string): Promise<void> {
      const edge = await cache();
      const key = cacheKey(origin);
      await edge.delete(key);
      waitUntil(sleep(PLAY_SETTLE_MS).then(() => edge.delete(key)));
    },
  };
}
