import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, policies, uncachedError } from "@/lib/http";
import { cachedMediaMeta, cachedThumbs, uploadedSeconds } from "@/lib/media";
import { bucket } from "@/lib/bucket";
import { requireOwner } from "@/lib/owner";
import { NO_THUMBS, type ThumbSet } from "@/lib/thumbs";

export const prerender = false;

/**
 * Container, tracks and tags for one object, demuxed on the Worker from ranged
 * reads of its header and index. Public for whatever the bucket serves publicly;
 * a private file's metadata is the owner's alone.
 */
export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  // Refused exactly as /api/files/download refuses them.
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found-json" }));
  let decision: Awaited<ReturnType<ReturnType<typeof bucket.view>["canRead"]>>;
  try {
    decision = await bucket.view(owner).canRead(url.searchParams.get("key"));
  } catch (error) {
    // The session lookup behind the owner check; D1 can be briefly out.
    decision = { ok: false, refusal: "unavailable", error };
  }
  if (!decision.ok) {
    switch (decision.refusal) {
      case "bad-request":
        return json({ error: "Bad request" }, { status: 400, policy: uncachedError });
      case "not-found":
        return json({ error: "Not found" }, { status: 404, policy: uncachedError });
      case "unavailable":
        console.error("[files] meta failed", url.searchParams.get("key"), decision.error);
        return json({ error: "Metadata unavailable" }, { status: 502, policy: uncachedError });
    }
  }
  const { key } = decision;

  const r2 = env.BUCKET;
  if (!r2) return json({ error: "Bucket not configured" }, { status: 503, policy: uncachedError });

  try {
    const object = await r2.head(key);
    if (!object) return json({ error: "Not found" }, { status: 404, policy: uncachedError });

    const meta = await cachedMediaMeta(r2, key, object);

    // Secondary: a failed thumbs lookup only means the browser draws its own.
    let thumbs: ThumbSet = NO_THUMBS;
    if (meta.supported) {
      thumbs = await cachedThumbs(r2, key, uploadedSeconds(object)).catch((error) => {
        console.error("[files] thumbs lookup failed", error);
        return NO_THUMBS;
      });
    }

    return json({ ...meta, size: object.size, uploaded: uploadedSeconds(object), thumbs }, { policy: policies.files });
  } catch (error) {
    console.error("[files] meta failed", key, error);
    return json({ error: "Metadata unavailable" }, { status: 502, policy: uncachedError });
  }
};
