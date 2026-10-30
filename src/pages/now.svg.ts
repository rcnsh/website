import type { APIRoute } from "astro";
import { z } from "zod";
import { cached } from "@/lib/cache";
import { policies } from "@/lib/http";
import { pickLine, renderNowCard, type NowLine, type NowSnapshot, type Theme } from "@/lib/now-card";
import { clock } from "@/lib/site";
import { getNowPlaying } from "@/lib/spotify";
import { warehouse } from "@/lib/warehouse";

export const prerender = false;

/** Shifts slowly, so an hour fresh is plenty. */
const REPEAT_FRESHNESS = 60 * 60;
/** Past this a view still gets the stored snapshot at once, and refreshes it behind. */
const SNAPSHOT_FRESHNESS = 15;

const localDay = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-CA", { timeZone: clock.timeZone });

/** The most played song of the last 7 days, or null for a quiet week. */
async function onRepeat(): Promise<NowLine> {
  const query = new URLSearchParams({ from: localDay(6), to: localDay(0), tz: clock.timeZone, limit: "1" });
  return warehouse.read({
    path: `/api/top-tracks?${query}`,
    schema: z
      .object({ tracks: z.array(z.object({ name: z.string(), artist: z.string().nullable() })) })
      .transform(({ tracks: [top] }): NowLine =>
        top ? { state: "repeat", title: top.name, artists: top.artist } : { state: "none" },
      ),
    cache: { key: "on-repeat:7d", freshForSeconds: REPEAT_FRESHNESS },
  });
}

/** Both lookups at once. Throws only when neither answered, so a stale snapshot is kept. */
async function loadSnapshot(): Promise<NowSnapshot> {
  const [current, fallback] = await Promise.allSettled([getNowPlaying(), onRepeat()]);
  if (current.status === "rejected") console.error("[music] now.svg live lookup failed", current.reason);
  if (current.status === "rejected" && fallback.status === "rejected") throw fallback.reason;

  const playing = current.status === "fulfilled" && current.value.isPlaying ? current.value : null;
  return {
    live: playing && {
      title: playing.title,
      artists: playing.artists,
      endsAt: Date.now() + Math.max(playing.durationMs - playing.progressMs, 0),
    },
    fallback: fallback.status === "fulfilled" ? fallback.value : { state: "none" },
  };
}

/**
 * The live line for the GitHub profile README. A view never waits on the
 * warehouse once a snapshot exists: `cached()` serves it and refreshes behind.
 * GitHub's image proxy may keep it 30s, the same order as the snapshot's age.
 */
export const GET: APIRoute = async ({ url }) => {
  const theme: Theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";

  let line: NowLine;
  try {
    line = pickLine(await cached("now-svg:snapshot", SNAPSHOT_FRESHNESS, loadSnapshot), Date.now());
  } catch (error) {
    console.error("[music] now.svg failed", error);
    line = { state: "none" };
  }

  return new Response(renderNowCard(line, theme), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": policies.nowSvg,
    },
  });
};
