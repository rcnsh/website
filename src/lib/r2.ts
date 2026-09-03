import { env } from "cloudflare:workers";
import { cached } from "@/lib/cache";

/**
 * R2 listing through the native bucket binding. Files go over the wire as
 * tuples, with the key and public URL rebuilt in the browser from the prefix.
 *
 * `cachedTree()` is what the page calls — every directory at once, out of KV.
 * `listDirectory()` reads one at a time, once the bucket outgrows the tree.
 */

/**
 * Path, size in bytes, upload time in whole seconds. The path is relative to
 * its listing: a bare filename in a directory, a full key in search results.
 */
export type R2File = [path: string, size: number, uploaded: number];

export type R2Listing = {
  /** Folder names, relative to this listing's prefix. */
  folders: string[];
  files: R2File[];
  /** Only present, and only true, when the listing was cut short. */
  truncated?: boolean;
};

/** Every directory in the bucket, keyed by prefix ("" is the root). */
export type R2Tree = Record<string, R2Listing>;

/** Above this the tree is too big to inline, even packed, so lazy-load instead. */
const FULL_TREE_MAX_OBJECTS = 5000;

/** KV key for the packed tree. Bump the suffix whenever the packing changes. */
const TREE_CACHE_KEY = "files:tree:1";

/** How long a cached tree is served before a refresh runs behind the response. */
const TREE_FRESH_SECONDS = 300;

/** Sorts the way a file manager does: case-blind, and 2 before 10. */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Dot-prefixed entries stay hidden, the same way `ls` hides them. */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Hidden anywhere along the path, so `.thumbs/x.png` counts. /api/files/download
 * applies it too, so a hidden key cannot be requested by name.
 */
export function isHiddenKey(key: string): boolean {
  return key.split("/").some(isHidden);
}

/** Rejects `..`, absolute paths, and anything that isn't a clean prefix. */
export function normalisePrefix(input: string | null | undefined): string {
  if (!input) return "";
  const cleaned = input.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (cleaned.split("/").includes("..")) return "";
  if (!cleaned) return "";
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

/**
 * The bucket's public origin, or "" when downloads must proxy through the
 * worker. The browser builds every file URL from it.
 */
export function publicBucketBase(): string {
  return (env.PUBLIC_BUCKET_URL || "").replace(/\/+$/, "");
}

function requireBucket(): R2Bucket {
  const bucket = env.BUCKET;
  if (!bucket) {
    throw new Error(
      "R2 binding `BUCKET` is missing. Check the r2_buckets entry in wrangler.jsonc.",
    );
  }
  return bucket;
}

export async function listDirectory(prefix = ""): Promise<R2Listing> {
  const bucket = requireBucket();

  const folders = new Set<string>();
  const files: R2File[] = [];

  let cursor: string | undefined;
  let truncated = false;
  // Bounded so a pathological bucket can't spin here forever.
  for (let page = 0; page < 20; page++) {
    const result = await bucket.list({
      prefix,
      delimiter: "/",
      limit: 1000,
      cursor,
      // No `include` — httpMetadata costs extra and isn't used.
    });

    for (const delimited of result.delimitedPrefixes) {
      const name = delimited.slice(prefix.length).replace(/\/$/, "");
      if (!name || isHidden(name)) continue;
      folders.add(name);
    }

    for (const object of result.objects) {
      const name = object.key.slice(prefix.length);
      // Skip the zero-byte markers some clients create to fake a directory.
      if (!name || name.includes("/")) continue;
      if (object.size === 0) continue;
      if (isHidden(name)) continue;

      files.push([name, object.size, toEpochSeconds(object.uploaded)]);
    }

    if (!result.truncated) break;
    cursor = result.cursor;
    if (page === 19) truncated = true;
  }

  const listing: R2Listing = {
    folders: [...folders].sort(collator.compare),
    files: files.sort((a, b) => collator.compare(a[0], b[0])),
  };
  if (truncated) listing.truncated = true;
  return listing;
}

/**
 * One flat pass over the bucket, folded into a listing per directory. Returns
 * null past FULL_TREE_MAX_OBJECTS, telling the caller to lazy-load instead.
 */
export async function listWholeTree(): Promise<R2Tree | null> {
  const bucket = requireBucket();

  const tree: R2Tree = { "": { folders: [], files: [] } };
  const ensure = (prefix: string): R2Listing =>
    (tree[prefix] ??= { folders: [], files: [] });

  const seenFolders = new Set<string>();
  let count = 0;
  let cursor: string | undefined;

  while (true) {
    const result = await bucket.list({ limit: 1000, cursor });

    for (const object of result.objects) {
      if (object.size === 0 || object.key.endsWith("/")) continue;

      const segments = object.key.split("/");
      const fileName = segments.pop();
      if (!fileName || segments.some(isHidden) || isHidden(fileName)) continue;

      if (++count > FULL_TREE_MAX_OBJECTS) return null;

      // Walk the ancestors, registering each folder with its parent once.
      let prefix = "";
      for (const segment of segments) {
        const childPrefix = `${prefix}${segment}/`;
        if (!seenFolders.has(childPrefix)) {
          seenFolders.add(childPrefix);
          ensure(prefix).folders.push(segment);
        }
        prefix = childPrefix;
      }

      ensure(prefix).files.push([
        fileName,
        object.size,
        toEpochSeconds(object.uploaded),
      ]);
    }

    if (!result.truncated) break;
    cursor = result.cursor;
  }

  for (const listing of Object.values(tree)) {
    listing.folders.sort(collator.compare);
    listing.files.sort((a, b) => collator.compare(a[0], b[0]));
  }

  return tree;
}

/**
 * The tree the page renders, stale-while-revalidate out of KV. Capped at a
 * day, past which a missing upload beats a slow page and the request blocks.
 */
export async function cachedTree(): Promise<R2Tree | null> {
  return cached(TREE_CACHE_KEY, TREE_FRESH_SECONDS, listWholeTree, {
    maxStaleSeconds: 60 * 60 * 24,
  });
}

/**
 * Flat search across the whole bucket; paths are full keys.
 *
 * Answered out of the cached tree rather than R2: the endpoint is
 * unauthenticated and its query string is the caller's, so a live pass would
 * be a bucket scan anyone can start as fast as they like. Falls back to
 * searchByListing past FULL_TREE_MAX_OBJECTS.
 */
export async function searchBucket(query: string, limit = 100): Promise<R2File[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const tree = await cachedTree();
  if (!tree) return searchByListing(needle, limit);

  const matches: R2File[] = [];

  for (const [prefix, listing] of Object.entries(tree)) {
    for (const [name, size, uploaded] of listing.files) {
      const key = `${prefix}${name}`;
      if (!key.toLowerCase().includes(needle)) continue;

      matches.push([key, size, uploaded]);
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}

/**
 * A bounded walk over the bucket itself, for when it is too big to hold a tree
 * for. Expensive — the rate limit on /api/files/search is for this case.
 */
async function searchByListing(needle: string, limit: number): Promise<R2File[]> {
  const bucket = requireBucket();

  const matches: R2File[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20 && matches.length < limit; page++) {
    const result = await bucket.list({ limit: 1000, cursor });

    for (const object of result.objects) {
      if (object.size === 0 || object.key.endsWith("/")) continue;
      if (isHiddenKey(object.key)) continue;
      if (!object.key.toLowerCase().includes(needle)) continue;

      matches.push([object.key, object.size, toEpochSeconds(object.uploaded)]);
      if (matches.length >= limit) break;
    }

    if (!result.truncated) break;
    cursor = result.cursor;
  }

  return matches;
}

/**
 * One directory, out of the cached tree where there is one. Same reasoning as
 * searchBucket: `?prefix=` is the caller's, so a live LIST per request is a
 * scan anyone can start. An unknown prefix is an empty listing.
 */
export async function cachedDirectory(prefix = ""): Promise<R2Listing> {
  const tree = await cachedTree();
  if (!tree) return listDirectory(prefix);

  return tree[prefix] ?? { folders: [], files: [] };
}
