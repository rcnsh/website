import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { identify } from "@/lib/owner";
import { searchBucket } from "@/lib/r2";
import { loadRules } from "@/lib/visibility";
import { rulesVersion, visibilityOf } from "../../../../shared/visibility.ts";

export const prerender = false;

/** The tree behind this refreshes every five minutes anyway. */
const CACHE_SECONDS = 60;

/**
 * An unbounded query is an unbounded cache key, which turns this endpoint's
 * cache into a miss generator and every call back into a full walk of the tree.
 */
const MAX_QUERY = 64;

function json(body: unknown, cache: string): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", "cache-control": cache, vary: "cookie" },
  });
}

/**
 * Flat search over the bucket: reads the whole cached tree out of KV and walks
 * every key. Hence the tight rate-limit budget and the edge cache. Visitors
 * search listed folders only; the owner searches everything, uncached.
 */
export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (query.length < 2) {
    return new Response(JSON.stringify({ query, files: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  try {
    if ((await identify({ cookies, locals })).owner) {
      return json({ query, files: await searchBucket(query, 100) }, "private, no-store");
    }

    const rules = await loadRules();

    // Keyed on the normalised query, so `?q=x&`, `?q=X` and a stray second
    // parameter share one entry rather than minting three. The rules' version
    // is in the key so a folder made unlisted drops out at once, not after
    // the cached answer expires.
    const cacheKey = new Request(
      `${new URL(request.url).origin}/api/files/search?q=${encodeURIComponent(
        query.toLowerCase(),
      )}&v=${rulesVersion(rules)}`,
    );
    const cache = await caches.open("files-search");

    const hit = await cache.match(cacheKey);
    // Rebuilt rather than returned: a cached Response has immutable headers, and
    // the middleware throws setting security headers on one.
    if (hit) {
      const copy = new Response(hit.body, hit);
      copy.headers.set("vary", "cookie");
      return copy;
    }

    const files = await searchBucket(query, 100, (key) => visibilityOf(rules, key) === "listed");
    const response = json({ query, files }, `public, max-age=${CACHE_SECONDS}`);

    // Stored without `vary`, which is for the browser: the edge cache is
    // anonymous by construction, since the owner never reaches it.
    const stored = new Response(response.clone().body, response);
    stored.headers.delete("vary");
    waitUntil(cache.put(cacheKey, stored));
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
