import type { APIRoute } from "astro";
import { bucket } from "@/lib/bucket";
import { edgeCached } from "@/lib/edge";
import { json, policies, privateNoStore, uncachedError } from "@/lib/http";
import { identify } from "@/lib/owner";

export const prerender = false;

const MAX_QUERY = 64;

const VARY = { vary: "cookie" };

export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (query.length < 2) return json({ query, files: [] });

  try {
    if ((await identify({ cookies, locals })).owner) {
      return json({ query, files: await bucket.view(true).search(query) }, { policy: privateNoStore, headers: VARY });
    }

    const key = `${new URL(request.url).origin}/api/files/search?q=${encodeURIComponent(
      query.toLowerCase(),
    )}&v=${await bucket.version()}`;

    return await edgeCached(
      "files-search",
      key,
      async () => json({ query, files: await bucket.view(false).search(query) }),
      { policy: policies.files, headers: VARY },
    );
  } catch (error) {
    console.error("[files] search failed", error);
    return json({ query, files: [], error: true }, { policy: uncachedError });
  }
};
