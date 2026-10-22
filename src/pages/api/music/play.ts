import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSession, isOwner } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";
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
  return json(await response.json().catch(() => ({})), response.status);
};
