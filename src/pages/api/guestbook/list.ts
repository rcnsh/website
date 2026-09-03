import type { APIRoute } from "astro";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";

export const prerender = false;

/**
 * The next page of signatures. Public, like the page it feeds — every field is
 * already rendered on /guestbook, and country is deliberately not among them.
 * Delete rights are decided by /api/guestbook/delete, not here.
 *
 * A missing or malformed cursor returns the first page rather than an error.
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
