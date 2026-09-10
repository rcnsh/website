import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";

export const prerender = false;

/**
 * How long a page is held at the edge. Matches FRESH_SECONDS on the KV entry
 * for page 1, so the two layers expire together rather than one serving
 * through the other.
 */
const CACHE_SECONDS = 60;

/**
 * The next page of signatures. Public, like the page it feeds — every field is
 * already rendered on /guestbook, and country is deliberately not among them.
 * Delete rights are decided by /api/guestbook/delete, not here.
 *
 * A missing or malformed cursor returns the first page rather than an error.
 *
 * Cached at the edge because the KV layer covers page 1 only: `getPage(after)`
 * goes straight to D1 for every deep page, at exactly 26 rows a call whatever
 * the table size. That is bounded per call but not per minute — the route is
 * anonymous and sits on the 120/min api budget, which is ~4.49M rows/day from
 * a single host per colo. `cache-control` alone did not help: it is a browser
 * instruction, and Cloudflare does not CDN-cache Worker responses by default.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const after = decodeCursor(url.searchParams.get("after"));

  /*
    Keyed on the re-encoded cursor rather than the raw parameter, so the key
    space is bounded by cursors the app can actually produce. decodeCursor
    validates against /^(\d{1,15}):(\d{1,15})$/ and returns null otherwise, so
    junk collapses onto the page-1 key instead of minting an entry per garbage
    string — which is what would turn this cache into the amplifier it is meant
    to prevent.
  */
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
          // Public, identical for everyone, and a page of the guestbook is not
          // news. Matches the KV window on the first page.
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
