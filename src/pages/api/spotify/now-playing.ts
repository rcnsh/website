import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { getNowPlaying, getRecentTracks } from "@/lib/spotify";

export const prerender = false;

/**
 * Live listening state for the home page card, falling back to the last played
 * track. Every visitor polls every 20s and `getNowPlaying()` is uncached
 * upstream, so this window collapses them into one warehouse call per colo.
 */
const CACHE_SECONDS = 10;

/** Stamped on the cached copy so a hit can tell how far the track has moved. */
const CACHED_AT = "x-cached-at";

type Payload = Record<string, unknown> & { state: string };

/**
 * Serves a cache hit, advancing the stored progress by the entry's age so the
 * client's bar does not rewind on every poll.
 *
 * Every path builds a new Response rather than returning the cached one: a
 * cached Response has immutable headers, and the middleware throws setting
 * security headers on it.
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
    console.error("[music] now-playing failed", error);
    // Not cached: a transient upstream failure shouldn't outlive itself.
    return new Response(JSON.stringify({ state: "error" }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }
};
