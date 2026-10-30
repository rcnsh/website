import type { APIRoute } from "astro";
import { json, policies } from "@/lib/http";
import { getTop, type TimeRange } from "@/lib/spotify";

export const prerender = false;

const RANGES: TimeRange[] = ["short_term", "medium_term", "long_term"];

export const GET: APIRoute = async ({ url }) => {
  const requested = url.searchParams.get("range") as TimeRange | null;
  const range: TimeRange =
    requested && RANGES.includes(requested) ? requested : "long_term";

  try {
    const { tracks, artists } = await getTop(range, 12);

    return json({ range, tracks, artists }, { policy: policies.top(range) });
  } catch (error) {
    console.error("[music] top failed", error);
    return json({ range, tracks: [], artists: [], error: true });
  }
};
