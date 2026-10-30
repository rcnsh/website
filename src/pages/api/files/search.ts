import type { APIRoute } from "astro";
import { bucket } from "@/lib/bucket";
import { edgeCached } from "@/lib/edge";
import { json, policies, privateNoStore, uncachedError } from "@/lib/http";
import { identify } from "@/lib/owner";

export const prerender = false;

/**
 * An unbounded query is an unbounded cache key, which turns this endpoint's
 * cache into a miss generator and every call back into a full walk of the tree.
 */
const MAX_QUERY = 64;

// For the browser, which would otherwise keep serving the visitor copy after
// sign-in. Never stored: the edge cache is anonymous by construction, since
// the owner never reaches it.
const VARY = { vary: "cookie" };

/**
 * Flat search over the bucket: reads the whole cached tree out of KV and walks
 * every key. Hence the tight rate-limit budget and the edge cache. Visitors
 * search listed folders only; the owner searches everything, uncached.
 */
export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);

  if (query.length < 2) return json({ query, files: [] });

  try {
    if ((await identify({ cookies, locals })).owner) {
      return json({ query, files: await bucket.view(true).search(query) }, { policy: privateNoStore, headers: VARY });
    }

    // Keyed on the normalised query, so `?q=x&`, `?q=X` and a stray second
    // parameter share one entry rather than minting three. The rules' version
    // is in the key so a folder made unlisted drops out at once, not after
    // the cached answer expires.
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
