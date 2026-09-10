import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { searchBucket } from "@/lib/r2";

export const prerender = false;

/** The tree behind this refreshes every five minutes anyway. */
const CACHE_SECONDS = 60;

/**
 * An unbounded query is an unbounded cache key, which turns this endpoint's
 * cache into a miss generator and every call back into a full walk of the tree.
 */
const MAX_QUERY = 64;

/**
 * Flat search over the bucket: reads the whole cached tree out of KV and walks
 * every key. Hence the tight rate-limit budget and the edge cache.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (query.length < 2) {
    return new Response(JSON.stringify({ query, files: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  // Keyed on the normalised query, so `?q=x&`, `?q=X` and a stray second
  // parameter share one entry rather than minting three.
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
