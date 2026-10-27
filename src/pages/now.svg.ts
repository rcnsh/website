import type { APIRoute } from "astro";
import { z } from "zod";
import { cached } from "@/lib/cache";
import { renderNowCard, type NowLine, type Theme } from "@/lib/now-card";
import { clock } from "@/lib/site";
import { getNowPlaying, warehouse } from "@/lib/spotify";

export const prerender = false;

/** Shifts slowly, so an hour fresh is plenty. */
const REPEAT_FRESHNESS = 60 * 60;

const localDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-CA", { timeZone: clock.timeZone });

/** The most played song of the last 7 days, or null for a quiet week. */
async function onRepeat(): Promise<NowLine> {
  return cached("warehouse:on-repeat:7d", REPEAT_FRESHNESS, async () => {
    const query = new URLSearchParams({ from: localDay(6), to: localDay(0), tz: clock.timeZone, limit: "1" });
    const parsed = z
      .object({ tracks: z.array(z.object({ name: z.string(), artist: z.string().nullable() })) })
      .safeParse(await warehouse(`/api/top-tracks?${query}`));
    // A shape change is a failure, not an empty week — see CLAUDE.md § Maintenance › Data.
    if (!parsed.success) {
      throw new Error(`warehouse /api/top-tracks returned an unexpected shape: ${parsed.error.message}`);
    }
    const [top] = parsed.data.tracks;
    return top ? { state: "repeat", title: top.name, artists: top.artist } : { state: "none" };
  });
}

/**
 * The live line for the GitHub profile README. GitHub serves README images
 * through its camo proxy, which honours no-cache, so every profile view asks
 * again. The warehouse shares one Spotify answer across callers, so that is cheap.
 */
export const GET: APIRoute = async ({ url }) => {
  const theme: Theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";

  let line: NowLine;
  try {
    const current = await getNowPlaying();
    line = current.isPlaying
      ? { state: "playing", title: current.title, artists: current.artists }
      : await onRepeat();
  } catch (error) {
    console.error("[music] now.svg failed", error);
    line = await onRepeat().catch(() => ({ state: "none" }) as const);
  }

  return new Response(renderNowCard(line, theme), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-cache, no-store, max-age=0, must-revalidate",
    },
  });
};
