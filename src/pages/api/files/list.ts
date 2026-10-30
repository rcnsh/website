import type { APIRoute } from "astro";
import { identify } from "@/lib/owner";
import { cachedDirectory, isHiddenKey, normalisePrefix } from "@/lib/r2";
import { loadRules, visitorDirectory } from "@/lib/visibility";

export const prerender = false;

/**
 * One directory of the bucket, from the cached tree — the prefix is the
 * caller's, so a live LIST per request is a bucket scan on tap. Visitors get
 * listed folders only; the owner gets everything.
 */
export const GET: APIRoute = async ({ url, cookies, locals }) => {
  const prefix = normalisePrefix(url.searchParams.get("prefix"));
  // The live-LIST fallback past the cached tree's cap does not skip hidden
  // keys, so refuse them here as thumbs.ts does.
  if (isHiddenKey(prefix)) {
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { owner } = await identify({ cookies, locals });
    const listing = owner ? await cachedDirectory(prefix) : await visitorDirectory(prefix, await loadRules());
    return new Response(JSON.stringify(listing), {
      headers: {
        "content-type": "application/json",
        "cache-control": owner ? "private, no-store" : "public, max-age=60",
        // Signing in changes the answer; without this the browser keeps serving the visitor copy.
        vary: "cookie",
      },
    });
  } catch (error) {
    console.error("[files] list failed", error);
    return new Response(
      JSON.stringify({ folders: [], files: [], error: "Bucket unavailable" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
};
