import type { APIRoute } from "astro";
import { searchBucket } from "@/lib/r2";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = (url.searchParams.get("q") ?? "").trim();

  if (query.length < 2) {
    return new Response(JSON.stringify({ query, files: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const files = await searchBucket(query, 100);
    return new Response(JSON.stringify({ query, files }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("[files] search failed", error);
    return new Response(JSON.stringify({ query, files: [], error: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
};
