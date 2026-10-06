import { env } from "cloudflare:workers";
import { cached } from "@/lib/cache";
import {
  bucketSource,
  READ_BUDGET,
  readMediaMeta,
  type MediaMeta,
  type ReadStats,
} from "@/lib/media-meta";
import {
  SOURCE_UPLOADED_FIELD,
  THUMB_KINDS,
  THUMBS_PREFIX,
  thumbSet,
  type ThumbKind,
  type ThumbSet,
} from "@/lib/thumbs";

/**
 * KV-backed lookups for /files previews. Metadata is keyed on the object key
 * and its upload time, so an entry can never go stale: a re-upload is a new key.
 */

/** Effectively forever; the entry is immutable. */
const META_FRESH_SECONDS = 60 * 60 * 24 * 365;

/** Thumbs appear when the owner backfills, which clears this entry anyway. */
const THUMBS_FRESH_SECONDS = 60 * 60;

/** Upload time as the listings carry it. */
export function uploadedSeconds(object: { uploaded: Date }): number {
  return Math.floor(object.uploaded.getTime() / 1000);
}

/** R2 keys run to 1024 bytes and KV keys stop at 512, so key on a digest. */
async function digest(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(hash).subarray(0, 16), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function cachedMediaMeta(
  bucket: R2Bucket,
  key: string,
  object: { size: number; uploaded: Date },
): Promise<MediaMeta> {
  const cacheKey = `files:meta:1:${await digest(key)}:${uploadedSeconds(object)}`;

  return cached(
    cacheKey,
    META_FRESH_SECONDS,
    async () => {
      const stats: ReadStats = { reads: 0, bytes: 0 };
      try {
        return await readMediaMeta(bucketSource(bucket, key, object.size, stats));
      } catch (error) {
        // Over budget is a property of the file, not a transient failure, so it
        // is the one error worth caching. Everything else rethrows.
        if (stats.reads > READ_BUDGET.reads || stats.bytes > READ_BUDGET.bytes) {
          console.warn(`[files] ${key} is too costly to index`, stats);
          return { supported: false } as const;
        }
        throw error;
      }
    },
    { maxStaleSeconds: META_FRESH_SECONDS * 2 },
  );
}

function thumbsCacheKey(hash: string, uploaded: number): string {
  return `files:thumbs:1:${hash}:${uploaded}`;
}

/**
 * Which previews exist for this upload of `key`. A thumb left over from an
 * earlier upload under the same key does not count.
 */
export async function cachedThumbs(
  bucket: R2Bucket,
  key: string,
  uploaded: number,
): Promise<ThumbSet> {
  return cached(
    thumbsCacheKey(await digest(key), uploaded),
    THUMBS_FRESH_SECONDS,
    async () => {
      const prefix = `${THUMBS_PREFIX}${key}.`;
      const listing = await bucket.list({
        prefix,
        include: ["customMetadata"],
        limit: 50,
      });
      return thumbSet(
        listing.objects
          .filter((o) => o.customMetadata?.[SOURCE_UPLOADED_FIELD] === String(uploaded))
          .map((o) => o.key.slice(prefix.length)),
      );
    },
  );
}

/** Drops the cached thumb set, so a backfill shows on the next read. */
export async function forgetThumbs(key: string, uploaded: number): Promise<void> {
  const kv = env.CACHE;
  if (!kv) return;
  try {
    await kv.delete(thumbsCacheKey(await digest(key), uploaded));
  } catch (error) {
    // The thumbs are already written; the entry ages out within the hour.
    console.error("[files] thumbs cache invalidation failed", error);
  }
}

/** The kinds, longest first, so `strip.webp` is not mistaken for a shorter match. */
const KINDS_BY_LENGTH = (Object.keys(THUMB_KINDS) as ThumbKind[]).sort(
  (a, b) => b.length - a.length,
);

export type FolderThumbs = Record<string, { uploaded: number; kinds: ThumbKind[] }>;

/**
 * Every thumb for the files directly in `prefix`, by file name. Owner-only:
 * it is a live listing, which is what makes it accurate right after a write.
 */
export async function folderThumbs(bucket: R2Bucket, prefix: string): Promise<FolderThumbs> {
  const base = `${THUMBS_PREFIX}${prefix}`;
  const result: FolderThumbs = {};

  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const listing = await bucket.list({
      prefix: base,
      delimiter: "/",
      include: ["customMetadata"],
      limit: 1000,
      cursor,
    });

    for (const object of listing.objects) {
      const rest = object.key.slice(base.length);
      const kind = KINDS_BY_LENGTH.find((k) => rest.endsWith(`.${k}`));
      const uploaded = Number(object.customMetadata?.[SOURCE_UPLOADED_FIELD]);
      if (!kind || !Number.isFinite(uploaded)) continue;

      const name = rest.slice(0, -(kind.length + 1));
      const entry = result[name];
      // Mixed upload times mean a half-finished earlier run; the newest wins.
      if (!entry || uploaded > entry.uploaded) {
        result[name] = { uploaded, kinds: [kind] };
      } else if (uploaded === entry.uploaded) {
        entry.kinds.push(kind);
      }
    }

    if (!listing.truncated) break;
    cursor = listing.cursor;
  }

  return result;
}
