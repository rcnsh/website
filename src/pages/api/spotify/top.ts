import type { APIRoute } from "astro";
import { getTopArtists, getTopTracks, type TimeRange } from "@/lib/spotify";

export const prerender = false;

const RANGES: TimeRange[] = ["short_term", "medium_term", "long_term"];

export const GET: APIRoute = async ({ url }) => {
  const requested = url.searchParams.get("range") as TimeRange | null;
  const range: TimeRange =
    requested && RANGES.includes(requested) ? requested : "long_term";

  try {
    const [tracks, artists] = await Promise.all([
      getTopTracks(range, 12),
      getTopArtists(range, 12),
    ]);

    return new Response(JSON.stringify({ range, tracks, artists }), {
      headers: {
        "content-type": "application/json",
        // Matches the KV TTL in lib/spotify.
        "cache-control": "public, max-age=900",
      },
    });
  } catch (error) {
    console.error("[spotify] top failed", error);
    return new Response(
      JSON.stringify({ range, tracks: [], artists: [], error: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
};
