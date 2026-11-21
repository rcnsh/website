import type { APIRoute } from "astro";
import { edgeCached } from "@/lib/edge";
import { decodeCursor, encodeCursor, getPage } from "@/lib/guestbook";
import { LIST_CACHE, listUrl } from "@/lib/guestbook-cache";
import { json, policies, uncachedError } from "@/lib/http";

export const prerender = false;

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
