import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

/**
 * Streams objects out of the R2 binding. Only reached when PUBLIC_BUCKET_URL
 * is unset — otherwise lib/r2 links straight at the public domain.
 */
export const GET: APIRoute = async ({ url, request }) => {
  const key = url.searchParams.get("key");

  if (!key || key.includes("..")) {
    return new Response("Bad request", { status: 400 });
  }

  const bucket = env.BUCKET;
  if (!bucket) return new Response("Bucket not configured", { status: 503 });

  const range = request.headers.get("range");
  const object = await bucket.get(key, range ? { range: request.headers } : undefined);

  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");
  headers.set("accept-ranges", "bytes");
  headers.set("content-disposition", "inline");

  if (object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
};
