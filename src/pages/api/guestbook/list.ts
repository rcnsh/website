import type { APIRoute } from "astro";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";

export const prerender = false;

/**
 * The next page of signatures, for the list that loads as the reader scrolls.
 *
 * Public, like the page it feeds — every field here is already rendered on
 * /guestbook. It carries no session state and no delete controls: whether the
 * reader may delete an entry is decided from githubId on the client, and acted
 * on by /api/guestbook/delete, which checks the session itself. The signer's
 * country is not among the fields; it exists to be counted on the map, and an
 * entry-by-entry feed of who signed from where is not the same thing.
 *
 * A missing or malformed cursor returns the first page rather than an error.
 * There is exactly one way to reach this endpoint honestly — the sentinel at
 * the bottom of the list, which always has a cursor — so a bad one is a probe,
 * and the cheapest true answer to a probe is the page everybody already has.
 */
export const GET: APIRoute = async ({ url }) => {
  const after = decodeCursor(url.searchParams.get("after"));

  try {
    const page = await getPage(after);

    return new Response(
      JSON.stringify({
        entries: page.entries,
        next: page.next ? encodeCursor(page.next) : null,
      }),
      {
        headers: {
          "content-type": "application/json",
          // Public, identical for everyone, and a page of the guestbook is not
          // news. Matches the KV window on the first page.
          "cache-control": "public, max-age=60",
        },
      },
    );
  } catch (error) {
    console.error("[guestbook] page fetch failed", error);
    return new Response(JSON.stringify({ entries: [], next: null, error: true }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
};
