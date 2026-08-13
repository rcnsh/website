import type { APIRoute } from "astro";
import { listDirectory, normalisePrefix } from "@/lib/r2";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const prefix = normalisePrefix(url.searchParams.get("prefix"));

  try {
    const listing = await listDirectory(prefix);
    return new Response(JSON.stringify(listing), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("[files] list failed", error);
    return new Response(
      JSON.stringify({
        prefix,
        folders: [],
        files: [],
        truncated: false,
        error: "Bucket unavailable",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
};
