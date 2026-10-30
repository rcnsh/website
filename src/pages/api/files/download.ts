import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { bucket } from "@/lib/bucket";
import { policies, privateNoStore } from "@/lib/http";
import { requireOwner } from "@/lib/owner";
import { publicBucketBase } from "@/lib/r2";

export const prerender = false;

/**
 * Content types safe to render inline on this origin. Everything else is forced
 * to a download: R2 echoes back whatever type an object was uploaded with, and
 * the bucket is a ShareX drop target. SVG is absent — it can carry <script>.
 */
const INLINE_SAFE = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "audio/",
  "video/",
  "application/pdf",
];

function inlineSafe(type: string | undefined): boolean {
  if (!type) return false;
  const bare = type.split(";")[0].trim().toLowerCase();
  return INLINE_SAFE.some((ok) =>
    ok.endsWith("/") ? bare.startsWith(ok) : bare === ok,
  );
}

/**
 * Streams objects out of the R2 binding. Two callers: the owner fetching a
 * private file, which upload.rcn.sh refuses, and anyone at all when
 * PUBLIC_BUCKET_URL is unset and there is no bucket domain to link to.
 */
export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  // A refused owner check also drops a stale owner hint.
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found" }));
  const decision = await bucket.view(owner).canRead(url.searchParams.get("key"));

  if (!decision.ok) {
    switch (decision.refusal) {
      case "bad-request":
        return new Response("Bad request", { status: 400 });
      case "not-found":
        return new Response("Not found", { status: 404 });
      case "unavailable":
        console.error("[files] rules unavailable", decision.error);
        return new Response("Unavailable", { status: 503 });
    }
  }

  const isPrivate = decision.visibility === "private";
  if (!isPrivate && publicBucketBase()) {
    // A public object is linked on the bucket's domain, so this route has no
    // caller for it — and bucket bytes on the site's own origin are worse.
    return new Response("Not found", { status: 404 });
  }

  const r2 = env.BUCKET;
  if (!r2) return new Response("Bucket not configured", { status: 503 });

  const range = request.headers.get("range");
  const object = await r2.get(
    decision.key,
    range ? { range: request.headers } : undefined,
  );

  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", isPrivate ? privateNoStore : policies.download);
  headers.set("accept-ranges", "bytes");

  // An opaque origin regardless of type, so a rendered document cannot reach
  // this site's cookies or storage. Redundant with the content-type below.
  headers.set("content-security-policy", "sandbox");
  headers.set("x-content-type-options", "nosniff");

  if (inlineSafe(headers.get("content-type") ?? undefined)) {
    headers.set("content-disposition", "inline");
  } else {
    // Not on the inert list: strip the stored type and hand it over as a file.
    headers.set("content-type", "application/octet-stream");
    const filename = (decision.key.split("/").pop() || "download").replace(/"/g, "");
    headers.set(
      "content-disposition",
      `attachment; filename="${filename}"`,
    );
  }

  if (object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set(
      "content-range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
};
