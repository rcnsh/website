import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { contentRange, isRangeError, rangeOutcome, rangeToAsk } from "../../../../shared/bucket-http.ts";
import { uncachedError } from "../../../../shared/cache-policy.ts";
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

const REFUSAL_HEADERS = { "cache-control": uncachedError, "x-content-type-options": "nosniff" };

export const GET: APIRoute = async ({ url, request, cookies, locals }) => {
  const owner = async () => !(await requireOwner({ request, cookies, url, locals }, { refuse: "not-found" }));
  const decision = await bucket.view(owner).canRead(url.searchParams.get("key"));

  if (!decision.ok) {
    if (decision.refusal === "unavailable") console.error("[files] rules unavailable", decision.error);
    return new Response(REFUSALS[decision.refusal].message, {
      status: REFUSALS[decision.refusal].status,
      headers: REFUSAL_HEADERS,
    });
  }

  const isPrivate = decision.visibility === "private";
  if (!isPrivate && publicBucketBase()) {
    return new Response("Not found", { status: 404, headers: REFUSAL_HEADERS });
  }

  const r2 = env.BUCKET;
  if (!r2) return new Response("Bucket not configured", { status: 503, headers: REFUSAL_HEADERS });

  const range = request.headers.get("range");
  const refuse = (status: 404 | 416, extra: Record<string, string> = {}) =>
    new Response(status === 404 ? "Not found" : "Range not satisfiable", {
      status,
      headers: { ...REFUSAL_HEADERS, ...extra },
    });
  const asked = rangeToAsk(range);
  let object: R2ObjectBody | null;
  try {
    object = await r2.get(decision.key, asked ? { range: request.headers } : undefined);
  } catch (error) {
    if (!asked || !isRangeError(error)) throw error;
    const head = await r2.head(decision.key);
    return head ? refuse(416, { "content-range": `bytes */${head.size}` }) : refuse(404);
  }

  if (!object) return refuse(404);
  const outcome = rangeOutcome(range, object);
  if (outcome.kind === "unsatisfiable") {
    await object.body.cancel();
    return refuse(416, { "content-range": outcome.contentRange });
  }

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

  if (outcome.kind === "partial") {
    headers.set("content-range", contentRange(outcome.span, object.size));
    headers.set("content-length", String(outcome.span.length));
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
};
