import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { contentRange, span } from "../../../../shared/bucket-http.ts";
import { bucket } from "@/lib/bucket";
import { policies, privateNoStore } from "@/lib/http";
import { requireOwner } from "@/lib/owner";
import { publicBucketBase } from "@/lib/r2";
import { REFUSALS } from "../../../../shared/visibility.ts";

export const prerender = false;

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

export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found" }));
  const decision = await bucket.view(owner).canRead(url.searchParams.get("key"));

  if (!decision.ok) {
    if (decision.refusal === "unavailable") console.error("[files] rules unavailable", decision.error);
    return new Response(REFUSALS[decision.refusal].message, { status: REFUSALS[decision.refusal].status });
  }

  const isPrivate = decision.visibility === "private";
  if (!isPrivate && publicBucketBase()) {
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

  headers.set("content-security-policy", "sandbox");
  headers.set("x-content-type-options", "nosniff");

  if (inlineSafe(headers.get("content-type") ?? undefined)) {
    headers.set("content-disposition", "inline");
  } else {
    headers.set("content-type", "application/octet-stream");
    const filename = (decision.key.split("/").pop() || "download").replace(/"/g, "");
    headers.set(
      "content-disposition",
      `attachment; filename="${filename}"`,
    );
  }

  const served = range ? span(object) : null;
  if (served) {
    headers.set("content-range", contentRange(served, object.size));
    headers.set("content-length", String(served.length));
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
};
