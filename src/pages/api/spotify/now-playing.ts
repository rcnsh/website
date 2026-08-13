import type { APIRoute } from "astro";
import { getNowPlaying, getRecentTracks } from "@/lib/spotify";

export const prerender = false;

/**
 * Live listening state for the home page card. Falls back to the last played
 * track so the widget always has something to show.
 */
export const GET: APIRoute = async () => {
  const json = (body: unknown, cacheSeconds = 0) =>
    new Response(JSON.stringify(body), {
      headers: {
        "content-type": "application/json",
        "cache-control": cacheSeconds
          ? `public, max-age=${cacheSeconds}`
          : "no-store",
      },
    });

  try {
    const current = await getNowPlaying();

    if (current.isPlaying) {
      return json({
        state: "playing",
        title: current.title,
        artists: current.artists,
        album: current.album,
        image: current.image,
        url: current.url,
        progressMs: current.progressMs,
        durationMs: current.durationMs,
      });
    }

    const [recent] = await getRecentTracks(1);
    if (recent) {
      return json(
        {
          state: "recent",
          title: recent.title,
          artists: recent.artists,
          album: recent.album,
          image: recent.image,
          url: recent.url,
          playedAt: recent.playedAt,
        },
        60,
      );
    }

    return json({ state: "idle" }, 60);
  } catch (error) {
    console.error("[spotify] now-playing failed", error);
    return json({ state: "error" });
  }
};
