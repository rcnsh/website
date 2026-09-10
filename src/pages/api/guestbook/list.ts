import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";

export const prerender = false;

/** Matches FRESH_SECONDS on page 1's KV entry, so both layers expire together. */
const CACHE_SECONDS = 60;

/**
 * The next page of signatures. Public, like the page it feeds; country is
 * deliberately not among the fields. A malformed cursor returns page 1.
 *
 * Cached at the edge because KV covers page 1 only, so every deep page is a
 * D1 read on an anonymous route. `cache-control` alone does not do it —
 * Cloudflare does not CDN-cache Worker responses by default.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const after = decodeCursor(url.searchParams.get("after"));

  // Keyed on the re-encoded cursor, not the raw parameter: junk collapses onto
  // the page-1 key instead of minting an entry per garbage string.
  const cacheKey = new Request(
    `${new URL(request.url).origin}/api/guestbook/list${
      after ? `?after=${encodeURIComponent(encodeCursor(after))}` : ""
    }`,
  );
  const cache = await caches.open("guestbook-list");

  const hit = await cache.match(cacheKey);
  // Rebuilt rather than returned: a cached Response has immutable headers, and
  // the middleware throws setting security headers on one.
  if (hit) return new Response(hit.body, hit);

  try {
    const page = await getPage(after);

    const response = new Response(
      JSON.stringify({
        entries: page.entries,
        next: page.next ? encodeCursor(page.next) : null,
      }),
      {
        headers: {
          "content-type": "application/json",
          // Matches the KV window on the first page.
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
        },
      },
    );

    waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("[guestbook] page fetch failed", error);
    // Not cached: a transient D1 failure shouldn't outlive itself.
    return new Response(JSON.stringify({ entries: [], next: null, error: true }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
};
