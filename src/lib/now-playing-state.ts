import { uncachedError } from "../../shared/cache-policy.ts";
import { createEdgeCache, type EdgeCache } from "./edge-cache.ts";
import { json, policies } from "./http.ts";
import { PLAY_SETTLE_MS, type NowPlayingPayload } from "./now-playing.ts";
import type { NowPlaying, RecentTrack } from "./spotify-reads.ts";
import { WarehouseShapeError } from "./warehouse-client.ts";

export type { EdgeCache } from "./edge-cache.ts";

export type NowPlayingReads = {
  live: () => Promise<NowPlaying>;
  lastPlayed: () => Promise<RecentTrack | null>;
  stored: () => Promise<RecentTrack | null>;
};

export type NowPlayingDeps = {
  cache: (name: string) => Promise<EdgeCache>;
  reads: NowPlayingReads;
  now: () => number;
  waitUntil: (promise: Promise<unknown>) => void;
  sleep: (ms: number) => Promise<void>;
};

const CACHED_AT = "x-cached-at";

const NAME = "now-playing";

const cacheKey = (origin: string) => `${origin}/api/spotify/now-playing`;

export function createNowPlaying({ cache, reads, now, waitUntil, sleep }: NowPlayingDeps) {
  const { edgeCached, invalidateEdge } = createEdgeCache({ open: cache, waitUntil });

  async function read(): Promise<NowPlayingPayload> {
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

  async function fromCache(hit: Response): Promise<Response> {
    let payload = (await hit.json()) as NowPlayingPayload;
    const cachedAt = Number(hit.headers.get(CACHED_AT));
    if (payload.state === "playing" && Number.isFinite(cachedAt)) {
      payload = { ...payload, progressMs: Math.min(payload.progressMs + (now() - cachedAt), payload.durationMs) };
    }
    return json(payload);
  }

  return {
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
        return json({ state: "error" } satisfies NowPlayingPayload, { status: 503, policy: uncachedError });
      }
    },

    async invalidateAfterPlay(origin: string): Promise<void> {
      const key = cacheKey(origin);
      await invalidateEdge(NAME, key);
      waitUntil(sleep(PLAY_SETTLE_MS).then(() => invalidateEdge(NAME, key)));
    },
  };
}
