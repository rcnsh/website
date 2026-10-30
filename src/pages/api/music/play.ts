import type { APIRoute } from "astro";
import { waitUntil } from "cloudflare:workers";
import { getSession, isOwner } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { nowPlayingCache } from "@/lib/now-playing-cache";
import { isTrackId } from "@/lib/track-play";
import { WarehouseNotConfigured, warehouse } from "@/lib/warehouse";

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
export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();
  if (!isOwner(await getSession(cookies))) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON" }, 400);
  }
  const trackId = (body as { track_id?: unknown } | null)?.track_id;
  if (!isTrackId(trackId)) return json({ error: "Bad track_id" }, 400);

  let response: Response;
  try {
    response = await warehouse.play(trackId);
  } catch (error) {
    if (error instanceof WarehouseNotConfigured) return json({ error: "Playback is not configured" }, 503);
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
