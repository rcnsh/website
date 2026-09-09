import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { searchBucket } from "@/lib/r2";

export const prerender = false;

/**
 * How long a result set is held at the edge. The bucket tree behind it is
 * itself refreshed every five minutes, so a minute here adds no staleness
 * worth speaking of.
 */
const CACHE_SECONDS = 60;

/**
 * Longest query answered. Beyond this it cannot match a key anyone would
 * upload, and the point of the cap is upstream of matching: an unbounded query
 * is an unbounded cache key, which is how a caller turns this endpoint's cache
 * into a miss generator and every call back into a full walk of the tree.
 */
const MAX_QUERY = 64;

/**
 * Flat search over the bucket. The most expensive route on the site — it reads
 * the whole cached tree out of KV and walks every key in it — so it is the one
 * with its own rate limit budget (see lib/throttle.ts) and the one that keeps
 * its answers at the edge.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (query.length < 2) {
    return new Response(JSON.stringify({ query, files: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  /* Keyed on the normalised query, not the request: `?q=x&`, `?q=X` and a
     stray second parameter are one entry between them rather than three. */
  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/files/search?q=${encodeURIComponent(
      query.toLowerCase(),
    )}`,
  );
  const cache = await caches.open("files-search");

  const hit = await cache.match(cacheKey);
  // Rebuilt rather than returned: a cached Response has immutable headers, and
  // the middleware throws setting security headers on one.
  if (hit) return new Response(hit.body, hit);

  try {
    const files = await searchBucket(query, 100);

    const response = new Response(JSON.stringify({ query, files }), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${CACHE_SECONDS}`,
      },
    });

    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("[files] search failed", error);
    // Not cached: a transient bucket failure shouldn't outlive itself.
    return new Response(JSON.stringify({ query, files: [], error: true }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
};
