import type { APIRoute } from "astro";
import { privateJson } from "@/lib/http";
import { requireOwner } from "@/lib/owner";
import { nowPlaying } from "@/lib/now-playing-server";
import { isTrackId } from "@/lib/track-play";
import { WarehouseNotConfigured, warehouse } from "@/lib/warehouse";

export const prerender = false;

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
    return privateJson({ error: "Expected JSON" }, 400);
  }
  const trackId = (body as { track_id?: unknown } | null)?.track_id;
  if (!isTrackId(trackId)) return privateJson({ error: "Bad track_id" }, 400);

  let response: Response;
  try {
    response = await warehouse.play(trackId);
  } catch (error) {
    if (error instanceof WarehouseNotConfigured) return privateJson({ error: "Playback is not configured" }, 503);
    return privateJson({ error: "music-warehouse unreachable" }, 502);
  }
  if (response.ok) await nowPlaying.invalidateAfterPlay(url.origin);
  return privateJson(await response.json().catch(() => ({})), response.status);
};
