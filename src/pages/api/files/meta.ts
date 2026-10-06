import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { cachedMediaMeta, cachedThumbs, uploadedSeconds } from "@/lib/media";
import { isHiddenKey } from "@/lib/r2";
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
 * reads of its header and index. Public, like the bucket it describes.
 */
export const GET: APIRoute = async ({ url }) => {
  const key = url.searchParams.get("key");

  // Refused exactly as /api/files/download refuses them.
  if (!key || key.includes("..")) return json({ error: "Bad request" }, 400, "no-store");
  if (isHiddenKey(key)) return json({ error: "Not found" }, 404, "no-store");

  const bucket = env.BUCKET;
  if (!bucket) return json({ error: "Bucket not configured" }, 503, "no-store");

  try {
    const object = await bucket.head(key);
    if (!object) return json({ error: "Not found" }, 404, "no-store");

    const meta = await cachedMediaMeta(bucket, key, object);

    // Secondary: a failed thumbs lookup only means the browser draws its own.
    let thumbs: ThumbSet = NO_THUMBS;
    if (meta.supported) {
      thumbs = await cachedThumbs(bucket, key, uploadedSeconds(object)).catch((error) => {
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
