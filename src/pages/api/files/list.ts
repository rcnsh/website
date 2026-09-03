import type { APIRoute } from "astro";
import { cachedDirectory, normalisePrefix } from "@/lib/r2";

export const prerender = false;

/**
 * One directory of the bucket, from the cached tree — the prefix is the
 * caller's, so a live LIST per request is a bucket scan on tap.
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
