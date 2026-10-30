import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { cachedMediaMeta, cachedThumbs, uploadedSeconds } from "@/lib/media";
import { bucket } from "@/lib/bucket";
import { requireOwner } from "@/lib/owner";
import { NO_THUMBS, type ThumbSet } from "@/lib/thumbs";

export const prerender = false;

function json(body: unknown, status = 200, cache = "public, max-age=60"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": cache },
  });
}

/**
 * Container, tracks and tags for one object, demuxed on the Worker from ranged
 * reads of its header and index. Public for whatever the bucket serves publicly;
 * a private file's metadata is the owner's alone.
 */
export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  // Refused exactly as /api/files/download refuses them.
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found-json" }));
  const decision = await bucket.view(owner).canRead(url.searchParams.get("key"));
  if (!decision.ok) {
    switch (decision.refusal) {
      case "bad-request":
        return json({ error: "Bad request" }, 400, "no-store");
      case "not-found":
        return json({ error: "Not found" }, 404, "no-store");
      case "unavailable":
        console.error("[files] meta failed", url.searchParams.get("key"), decision.error);
        return json({ error: "Metadata unavailable" }, 502, "no-store");
    }
  }
  const { key } = decision;

  const r2 = env.BUCKET;
  if (!r2) return json({ error: "Bucket not configured" }, 503, "no-store");

  try {
    const object = await r2.head(key);
    if (!object) return json({ error: "Not found" }, 404, "no-store");

    const meta = await cachedMediaMeta(r2, key, object);

    // Secondary: a failed thumbs lookup only means the browser draws its own.
    let thumbs: ThumbSet = NO_THUMBS;
    if (meta.supported) {
      thumbs = await cachedThumbs(r2, key, uploadedSeconds(object)).catch((error) => {
        console.error("[files] thumbs lookup failed", error);
        return NO_THUMBS;
      });
    }

    return json({ ...meta, size: object.size, uploaded: uploadedSeconds(object), thumbs });
  } catch (error) {
    console.error("[files] meta failed", key, error);
    return json({ error: "Metadata unavailable" }, 502, "no-store");
  }
};
