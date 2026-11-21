import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, policies, uncachedError } from "@/lib/http";
import { cachedMediaMeta, cachedThumbs, uploadedSeconds } from "@/lib/media";
import { bucket } from "@/lib/bucket";
import { requireOwner } from "@/lib/owner";
import { NO_THUMBS, type ThumbSet } from "@/lib/thumbs";
import { REFUSALS } from "../../../../shared/visibility.ts";

export const prerender = false;

export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found-json" }));
  let decision: Awaited<ReturnType<ReturnType<typeof bucket.view>["canRead"]>>;
  try {
    decision = await bucket.view(owner).canRead(url.searchParams.get("key"));
  } catch (error) {
    decision = { ok: false, refusal: "unavailable", error };
  }
  if (!decision.ok) {
    if (decision.refusal === "unavailable") console.error("[files] meta failed", url.searchParams.get("key"), decision.error);
    return json({ error: REFUSALS[decision.refusal].message }, { status: REFUSALS[decision.refusal].status, policy: uncachedError });
  }
  const { key } = decision;

  const r2 = env.BUCKET;
  if (!r2) return json({ error: "Bucket not configured" }, { status: 503, policy: uncachedError });

  try {
    const object = await r2.head(key);
    if (!object) return json({ error: "Not found" }, { status: 404, policy: uncachedError });

    const meta = await cachedMediaMeta(r2, key, object);

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
