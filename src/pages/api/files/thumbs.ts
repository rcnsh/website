import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { policies, privateJson } from "@/lib/http";
import { folderThumbs, forgetThumbs, uploadedSeconds } from "@/lib/media";
import { requireOwner } from "@/lib/owner";
import {
  isThumbKind,
  MAX_THUMBS_REQUEST_BYTES,
  SOURCE_UPLOADED_FIELD,
  THUMB_KINDS,
  thumbKey,
  thumbPartProblem,
  type ThumbKind,
} from "@/lib/thumbs";
import { folderPrefix } from "../../../../shared/bucket-keys.ts";

export const prerender = false;

/**
 * Whether the caller is the owner and, if so, which files in `prefix` already
 * have previews. Anyone else learns only `{ owner: false }`.
 */
export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "visitor" });
  if (refused) return refused;

  const bucket = env.BUCKET;
  if (!bucket) return privateJson({ error: "Bucket not configured" }, 503);

  const prefix = folderPrefix(url.searchParams.get("prefix"));
  if (prefix === null) return privateJson({ error: "Bad request" }, 400);

  try {
    return privateJson({ owner: true, thumbs: await folderThumbs(bucket, prefix) });
  } catch (error) {
    console.error("[files] thumbs listing failed", error);
    return privateJson({ owner: true, error: "Listing unavailable" }, 502);
  }
};

/**
 * Stores previews the owner's browser generated. Multipart: `key` names the
 * source object, and each other part is named for its kind (`poster.webp`,
 * `strip.webp`, `strip.json`, `peaks.json`). Targets are derived here, never
 * taken from the client, so nothing can be written outside `.thumbs/`.
 */
export const POST: APIRoute = async ({ request, cookies, url, locals }) => {
  const refused = await requireOwner({ request, cookies, url, locals }, { refuse: "forbidden", sameOrigin: true });
  if (refused) return refused;

  // Checked before the body is read. A missing length is refused too: a
  // chunked body could otherwise stream past the cap into formData().
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return privateJson({ error: "Length required" }, 411);
  if (length > MAX_THUMBS_REQUEST_BYTES) return privateJson({ error: "Too large" }, 413);

  const bucket = env.BUCKET;
  if (!bucket) return privateJson({ error: "Bucket not configured" }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return privateJson({ error: "Expected multipart form data" }, 400);
  }

  const key = form.get("key");
  if (typeof key !== "string" || !thumbKey(key, "poster.webp")) {
    return privateJson({ error: "Invalid source key" }, 400);
  }

  const parts: { kind: ThumbKind; target: string; bytes: Uint8Array }[] = [];
  for (const [name, value] of form) {
    if (name === "key") continue;
    if (!isThumbKind(name) || typeof value === "string") {
      return privateJson({ error: `Unexpected field ${name}` }, 400);
    }
    if (parts.some((p) => p.kind === name)) return privateJson({ error: `Duplicate ${name}` }, 400);

    const bytes = new Uint8Array(await value.arrayBuffer());
    const problem = thumbPartProblem(name, value.type, bytes);
    if (problem) return privateJson({ error: problem }, 400);

    const target = thumbKey(key, name);
    if (!target) return privateJson({ error: "Invalid source key" }, 400);
    parts.push({ kind: name, target, bytes });
  }

  if (parts.length === 0) return privateJson({ error: "Nothing to store" }, 400);
  const has = (kind: ThumbKind) => parts.some((p) => p.kind === kind);
  if (has("strip.webp") !== has("strip.json")) {
    return privateJson({ error: "strip.webp and strip.json go together" }, 400);
  }

  // Only thumbs for an object that exists, stamped with that upload's time.
  const source = await bucket.head(key);
  if (!source) return privateJson({ error: "Source not found" }, 404);
  const uploaded = uploadedSeconds(source);

  try {
    await Promise.all(
      parts.map(({ kind, target, bytes }) =>
        bucket.put(target, bytes, {
          httpMetadata: {
            contentType: THUMB_KINDS[kind].type,
            // Regenerating overwrites in place, so not immutable.
            cacheControl: policies.thumbObject,
          },
          customMetadata: { [SOURCE_UPLOADED_FIELD]: String(uploaded) },
        }),
      ),
    );
  } catch (error) {
    console.error("[files] thumbs write failed", key, error);
    return privateJson({ error: "Write failed" }, 502);
  }

  await forgetThumbs(key, uploaded);
  return privateJson({ stored: parts.map((p) => p.kind), uploaded });
};
