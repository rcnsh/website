import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isHiddenKey, publicBucketBase } from "@/lib/r2";

export const prerender = false;

/**
 * Content types safe to render inline on this origin. Everything else is
 * forced to a download, because the alternative is letting a bucket object
 * execute as same-origin script: R2 stores whatever content type it was
 * uploaded with, `writeHttpMetadata` echoes it verbatim, and `nosniff` only
 * makes the browser honour that stored type more faithfully. The bucket is a
 * ShareX drop target, so "nobody would upload an .html" is a convention, not
 * a control.
 *
 * SVG is deliberately absent: it is an image that can carry <script>.
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
 * Streams objects out of the R2 binding. Only reached when PUBLIC_BUCKET_URL
 * is unset — otherwise lib/r2 links straight at the public domain, and the
 * gate below makes that comment true rather than aspirational. It previously
 * answered anyway, which put arbitrary bucket content on the rcn.sh origin.
 */
export const GET: APIRoute = async ({ url, request }) => {
  // When the bucket has a public domain, every link in the UI points there
  // (lib/r2 `urlFor`), so this route has no caller — and serving bucket bytes
  // from the site's own origin is strictly worse than serving them from R2's.
  if (publicBucketBase()) {
    return new Response("Not found", { status: 404 });
  }

  const key = url.searchParams.get("key");

  if (!key || key.includes("..")) {
    return new Response("Bad request", { status: 400 });
  }

  // Every listing hides dot-prefixed entries; without this they would still be
  // downloadable by name, which makes the browser's idea of hidden a fiction.
  // 404 rather than 403, so this doesn't confirm what exists.
  if (isHiddenKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = env.BUCKET;
  if (!bucket) return new Response("Bucket not configured", { status: 503 });

  const range = request.headers.get("range");
  const object = await bucket.get(
    key,
    range ? { range: request.headers } : undefined,
  );

  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  headers.set("accept-ranges", "bytes");

  // An opaque origin regardless of type, so even a rendered document cannot
  // reach this site's cookies, storage or same-origin endpoints. Belt to the
  // content-type braces below, since either alone closes the hole.
  headers.set("content-security-policy", "sandbox");
  headers.set("x-content-type-options", "nosniff");

  if (inlineSafe(headers.get("content-type") ?? undefined)) {
    headers.set("content-disposition", "inline");
  } else {
    // Not on the inert list: strip the stored type and hand it over as a file.
    headers.set("content-type", "application/octet-stream");
    const filename = (key.split("/").pop() || "download").replace(/"/g, "");
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
