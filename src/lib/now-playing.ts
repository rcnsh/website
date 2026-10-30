/**
 * The now-playing card's wire contract and timings, shared by the route
 * (`./now-playing-state`) and the client (`NowPlaying.tsx`). Imported into
 * the page bundle, so it stays free of `cloudflare:workers` and of any
 * runtime import.
 */

export type NowPlayingPayload =
  | {
      state: "playing";
      title: string;
      artists: string;
      album: string | null;
      image: string | null;
      url: string | null;
      progressMs: number;
      durationMs: number;
    }
  | {
      state: "recent";
      title: string;
      artists: string;
      album: string | null;
      image: string | null;
      url: string | null;
      playedAt: string;
    }
  | { state: "idle" }
  | { state: "error" };

/**
 * How long one colo serves its copy. The live read is uncached upstream, so
 * this window is what collapses visitor polls into one call.
 */
export const CACHE_SECONDS = 10;

/**
 * The music-warehouse's own `PLAY_SETTLE_MS`: how long after a play it
 * refetches Spotify. Lives in that repo; change both together.
 */
export const PLAY_SETTLE_MS = 3_000;

/** After a play from the site, ask once the post-settle invalidation has run. */
export const PLAYED_REFRESH_MS = PLAY_SETTLE_MS + 500;

/**
 * Spotify keeps reporting a finished track for a few seconds, and the route
 * may serve that answer for a whole cache window, so the client retries the
 * end-of-track refresh across more than one window.
 */
export const END_RETRY_MS = 3_000;
export const END_RETRIES = 8;

/** Dispatched on `document` by `PlayOnSpotify` after a successful play. */
export const PLAYED_EVENT = "music:played";
