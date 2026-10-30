import type { APIRoute } from "astro";
import { env, waitUntil } from "cloudflare:workers";
import { requireOwner } from "@/lib/owner";
import { nowPlayingCache } from "@/lib/now-playing-cache";
import { isTrackId } from "@/lib/track-play";
import { deadline } from "@/lib/upstream";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/**
 * Starts `{ track_id }` on the owner's active Spotify device. Any answer but
 * 200 tells the page to open the link instead, so failures are passed through
 * rather than retried.
 */
export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "forbidden", sameOrigin: true });
  if (refused) return refused;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const trackId = (body as { track_id?: unknown } | null)?.track_id;
  if (!isTrackId(trackId)) return json({ error: "Bad track_id" }, 400);

  const { MUSIC_WAREHOUSE_URL, MUSIC_WAREHOUSE_CONTROL_TOKEN } = env;
  if (!MUSIC_WAREHOUSE_URL || !MUSIC_WAREHOUSE_CONTROL_TOKEN) return json({ error: "Playback is not configured" }, 503);

  let response: Response;
  try {
    response = await fetch(`${MUSIC_WAREHOUSE_URL.replace(/\/$/, "")}/control/play`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MUSIC_WAREHOUSE_CONTROL_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ track_id: trackId }),
      signal: deadline(),
    });
  } catch {
    return json({ error: "music-warehouse unreachable" }, 502);
  }
  if (response.ok) {
    // Ours still names the old track for up to 10s. Dropped again after the
    // warehouse has refetched (PLAY_SETTLE_MS there), in case a poll in
    // between cached what Spotify had not yet caught up on.
    const { cache, key } = await nowPlayingCache(url.origin);
    await cache.delete(key);
    waitUntil(new Promise((resolve) => setTimeout(resolve, 3_000)).then(() => cache.delete(key)));
  }
  return json(await response.json().catch(() => ({})), response.status);
};
