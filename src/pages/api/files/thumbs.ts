import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getSession, isOwner } from "@/lib/auth";
import { forbidden, sameOrigin } from "@/lib/csrf";
import { folderThumbs, forgetThumbs, uploadedSeconds } from "@/lib/media";
import { normalisePrefix } from "@/lib/r2";
import {
  isHiddenKey,
  isThumbKind,
  MAX_THUMBS_REQUEST_BYTES,
  SOURCE_UPLOADED_FIELD,
  THUMB_KINDS,
  thumbKey,
  thumbPartProblem,
  type ThumbKind,
} from "@/lib/thumbs";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/**
 * Whether the caller is the owner and, if so, which files in `prefix` already
 * have previews. Anyone else learns only `{ owner: false }`.
 */
export const GET: APIRoute = async ({ url, cookies }) => {
  if (!isOwner(await getSession(cookies))) return json({ owner: false });

  const bucket = env.BUCKET;
  if (!bucket) return json({ error: "Bucket not configured" }, 503);

  const prefix = normalisePrefix(url.searchParams.get("prefix"));
  if (isHiddenKey(prefix)) return json({ error: "Bad request" }, 400);

  try {
    return json({ owner: true, thumbs: await folderThumbs(bucket, prefix) });
  } catch (error) {
    console.error("[files] thumbs listing failed", error);
    return json({ owner: true, error: "Listing unavailable" }, 502);
  }
};

/**
 * Stores previews the owner's browser generated. Multipart: `key` names the
 * source object, and each other part is named for its kind (`poster.webp`,
 * `strip.webp`, `strip.json`, `peaks.json`). Targets are derived here, never
 * taken from the client, so nothing can be written outside `.thumbs/`.
 */
export const POST: APIRoute = async ({ request, cookies, url }) => {
  if (!sameOrigin(request, url.origin)) return forbidden();
  if (!isOwner(await getSession(cookies))) return forbidden();

  // Checked before the body is read. A missing length is refused too: a
  // chunked body could otherwise stream past the cap into formData().
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return json({ error: "Length required" }, 411);
  if (length > MAX_THUMBS_REQUEST_BYTES) return json({ error: "Too large" }, 413);

  const bucket = env.BUCKET;
  if (!bucket) return json({ error: "Bucket not configured" }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  const key = form.get("key");
  if (typeof key !== "string" || !thumbKey(key, "poster.webp")) {
    return json({ error: "Invalid source key" }, 400);
  }

  const parts: { kind: ThumbKind; target: string; bytes: Uint8Array }[] = [];
  for (const [name, value] of form) {
    if (name === "key") continue;
    if (!isThumbKind(name) || typeof value === "string") {
      return json({ error: `Unexpected field ${name}` }, 400);
    }
    if (parts.some((p) => p.kind === name)) return json({ error: `Duplicate ${name}` }, 400);

    const bytes = new Uint8Array(await value.arrayBuffer());
    const problem = thumbPartProblem(name, value.type, bytes);
    if (problem) return json({ error: problem }, 400);

    const target = thumbKey(key, name);
    if (!target) return json({ error: "Invalid source key" }, 400);
    parts.push({ kind: name, target, bytes });
  }

  if (parts.length === 0) return json({ error: "Nothing to store" }, 400);
  const has = (kind: ThumbKind) => parts.some((p) => p.kind === kind);
  if (has("strip.webp") !== has("strip.json")) {
    return json({ error: "strip.webp and strip.json go together" }, 400);
  }

  // Only thumbs for an object that exists, stamped with that upload's time.
  const source = await bucket.head(key);
  if (!source) return json({ error: "Source not found" }, 404);
  const uploaded = uploadedSeconds(source);

  try {
    await Promise.all(
      parts.map(({ kind, target, bytes }) =>
        bucket.put(target, bytes, {
          httpMetadata: {
            contentType: THUMB_KINDS[kind].type,
            // Regenerating overwrites in place, so not immutable.
            cacheControl: "public, max-age=86400",
          },
          customMetadata: { [SOURCE_UPLOADED_FIELD]: String(uploaded) },
        }),
      ),
    );
  } catch (error) {
    console.error("[files] thumbs write failed", key, error);
    return json({ error: "Write failed" }, 502);
  }

  await forgetThumbs(key, uploaded);
  return json({ stored: parts.map((p) => p.kind), uploaded });
};
