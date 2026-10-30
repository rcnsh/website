import type { APIRoute } from "astro";
import { edgeCached } from "@/lib/edge";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";
import { LIST_CACHE, listUrl } from "@/lib/guestbook-cache";
import { json, policies, uncachedError } from "@/lib/http";

export const prerender = false;

/**
 * The next page of signatures. Public, like the page it feeds; country is
 * deliberately not among the fields. A malformed cursor returns page 1.
 *
 * Cached at the edge because KV covers page 1 only, so every deep page is a
 * D1 read on an anonymous route. Its max-age is page 1's KV window, so both
 * layers expire together.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const after = decodeCursor(url.searchParams.get("after"));

  try {
    return await edgeCached(
      LIST_CACHE,
      listUrl(new URL(request.url).origin, after),
      async () => {
        const page = await getPage(after);
        return json({ entries: page.entries, next: page.next ? encodeCursor(page.next) : null });
      },
      { policy: policies.guestbookList },
    );
  } catch (error) {
    console.error("[guestbook] page fetch failed", error);
    return json({ entries: [], next: null, error: true }, { policy: uncachedError });
  }
};
