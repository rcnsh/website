import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { getNowPlaying, getRecentTracks } from "@/lib/spotify";

export const prerender = false;

/**
 * Live listening state for the home page card. Falls back to the last played
 * track so the widget always has something to show.
 *
 * Every visitor polls this every 20s, and `getNowPlaying()` is deliberately
 * uncached upstream, so without a window here each concurrent reader would
 * cost its own Spotify call — a straight path to a 429 that empties the
 * widget. The edge cache collapses them into one call per colo per window,
 * which is short enough that "now playing" still means it.
 */
const CACHE_SECONDS = 10;

/** Stamped on the cached copy so a hit can tell how far the track has moved. */
const CACHED_AT = "x-cached-at";

type Payload = Record<string, unknown> & { state: string };

/**
 * Serves a cache hit.
 *
 * A cached `playing` payload carries the progress as it was when Spotify was
 * asked. Left alone it would rewind the client's progress bar on every poll,
 * so it's advanced by the age of the entry on the way out.
 *
 * Every path here builds a new Response rather than handing back the one the
 * Cache API returned, which is not a detail: a cached Response has immutable
 * headers, and src/middleware.ts sets the security headers on everything the
 * Worker returns. Passing the hit straight through threw there instead —
 * a 500 with an empty body, on the paths that skipped the rewrite below.
 * Which was all of them except playback, so the widget broke precisely when
 * the music stopped.
 */
async function fromCache(hit: Response): Promise<Response> {
  const body = (await hit.json()) as Payload;
  const cachedAt = Number(hit.headers.get(CACHED_AT));

  const moved =
    body.state === "playing" &&
    typeof body.progressMs === "number" &&
    Number.isFinite(cachedAt);

  let payload = body;
  if (moved) {
    const duration = typeof body.durationMs === "number" ? body.durationMs : 0;
    payload = {
      ...body,
      progressMs: Math.min(
        (body.progressMs as number) + (Date.now() - cachedAt),
        duration,
      ),
    };
  }

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  // Keyed on the path alone — the response is the same for every visitor.
  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/spotify/now-playing`,
  );
  const cache = await caches.open("now-playing");

  const hit = await cache.match(cacheKey);
  if (hit) return fromCache(hit);

  const json = (body: unknown) => {
    const response = new Response(JSON.stringify(body), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${CACHE_SECONDS}`,
        [CACHED_AT]: String(Date.now()),
      },
    });
    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  };

  try {
    const current = await getNowPlaying();

    if (current.isPlaying) {
      return json({
        state: "playing",
        title: current.title,
        artists: current.artists,
        album: current.album,
        image: current.image,
        url: current.url,
        progressMs: current.progressMs,
        durationMs: current.durationMs,
      });
    }

    const [recent] = await getRecentTracks(1);
    if (recent) {
      return json({
        state: "recent",
        title: recent.title,
        artists: recent.artists,
        album: recent.album,
        image: recent.image,
        url: recent.url,
        playedAt: recent.playedAt,
      });
    }

    return json({ state: "idle" });
  } catch (error) {
    console.error("[spotify] now-playing failed", error);
    // Not cached: a transient upstream failure shouldn't outlive itself.
    return new Response(JSON.stringify({ state: "error" }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }
};
