import { uncachedError } from "../../shared/cache-policy.ts";
import { createEdgeCache, type EdgeCache } from "./edge-cache.ts";
import { json, policies } from "./http.ts";
import { PLAY_SETTLE_MS, type NowPlayingPayload } from "./now-playing.ts";
import type { NowPlaying, RecentTrack } from "./spotify-reads.ts";
import { WarehouseShapeError } from "./warehouse-client.ts";

/**
 * Freshness for `/api/spotify/now-playing`: one edge copy per colo, advanced
 * by its age on every hit, and dropped when the owner starts a track. Free of
 * `cloudflare:workers`; `./now-playing-server` binds it to the Worker.
 */

export type { EdgeCache } from "./edge-cache.ts";

export type NowPlayingReads = {
  live: () => Promise<NowPlaying>;
  lastPlayed: () => Promise<RecentTrack | null>;
  /** Lags the warehouse's ingest cron, so only the last resort. */
  stored: () => Promise<RecentTrack | null>;
};

export type NowPlayingDeps = {
  cache: (name: string) => Promise<EdgeCache>;
  reads: NowPlayingReads;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
  sleep: (ms: number) => Promise<void>;
};

/** Stamped on the cached copy so a hit can tell how far the track has moved. */
const CACHED_AT = "x-cached-at";

const NAME = "now-playing";

const cacheKey = (origin: string) => `${origin}/api/spotify/now-playing`;

export function createNowPlaying({ cache, reads, now, waitUntil, sleep }: NowPlayingDeps) {
  const { edgeCached, invalidateEdge } = createEdgeCache({ open: cache, waitUntil });

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

  /** Progress advanced by the copy's age, so the client's bar doesn't rewind. */
  async function fromCache(hit: Response): Promise<Response> {
    let payload = (await hit.json()) as NowPlayingPayload;
    const cachedAt = Number(hit.headers.get(CACHED_AT));
    if (payload.state === "playing" && Number.isFinite(cachedAt)) {
      payload = { ...payload, progressMs: Math.min(payload.progressMs + (now() - cachedAt), payload.durationMs) };
    }
    return json(payload);
  }

  return {
    /** The route's whole answer; the response is the same for every visitor. */
    async respond(origin: string): Promise<Response> {
      try {
        return await edgeCached(
          NAME,
          cacheKey(origin),
          async () => json(await read(), { headers: { [CACHED_AT]: String(now()) } }),
          { policy: policies.nowPlaying, fromHit: fromCache },
        );
      } catch (error) {
        console.error("[music] now-playing failed", error);
        // A 5xx, so the client keeps its last good card instead of replacing it.
        return json({ state: "error" } satisfies NowPlayingPayload, { status: 503, policy: uncachedError });
      }
    },

    /**
     * After the owner starts a track: the copy names the old one for up to a
     * window. Dropped again once the warehouse has refetched, in case a poll
     * in between cached what Spotify had not yet caught up on.
     */
    async invalidateAfterPlay(origin: string): Promise<void> {
      const key = cacheKey(origin);
      await invalidateEdge(NAME, key);
      waitUntil(sleep(PLAY_SETTLE_MS).then(() => invalidateEdge(NAME, key)));
    },
  };
}
