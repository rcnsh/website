import type { APIRoute } from "astro";
import { cachedDirectory, normalisePrefix } from "@/lib/r2";

export const prerender = false;

/**
 * One directory of the bucket.
 *
 * Served from the cached tree rather than a live LIST: the prefix is the
 * caller's to choose and there is no bound on how many distinct ones they can
 * ask for, so a LIST per request is a bucket scan on tap. See cachedDirectory.
 */
export const GET: APIRoute = async ({ url }) => {
  const prefix = normalisePrefix(url.searchParams.get("prefix"));

  try {
    const listing = await cachedDirectory(prefix);
    return new Response(JSON.stringify(listing), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
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
