import { env } from "cloudflare:workers";
import { cached } from "@/lib/cache";

/**
 * R2 listing through the native bucket binding.
 *
 * Listings go over the wire packed: a file is a tuple, and the two longest
 * strings it used to carry — its full key and its public URL — are rebuilt in
 * the browser from the prefix it sits under. At a few hundred files those
 * strings were most of the page's copy of the tree.
 *
 * `cachedTree()` is what the page calls: every directory at once, out of KV so
 * nobody waits on a LIST. `listDirectory()` reads one directory at a time — it
 * backs /api/files/list, and takes over once the bucket outgrows the tree.
 */

/**
 * One file: its path, its size in bytes, and when it was uploaded, in whole
 * seconds since the epoch. The path is relative to the listing it came from,
 * so it is a bare filename inside a directory listing and a full key in search
 * results, which are a listing of the root.
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
 * Hidden anywhere along the path, so `.thumbs/x.png` counts. Every listing
 * here filters on this; /api/files/download applies it too, so a key that is
 * missing from the browser can't simply be requested by name instead.
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
 * The bucket's public origin, trailing slash trimmed, or "" when there isn't
 * one and downloads have to proxy through the worker. The browser is handed
 * this once and builds every file's URL from it.
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
      // No `include` — httpMetadata costs extra work and isn't used.
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
 * The tree the page renders. A LIST over the whole bucket was the slowest
 * thing on /files and every visitor paid for it, so it goes through the same
 * stale-while-revalidate cache as Spotify and GitHub: the last tree comes
 * straight out of KV and the refresh happens after the response.
 *
 * Capped at a day of staleness — past that an upload missing from the page is
 * more confusing than a slow page, so the request blocks on a fresh listing.
 */
export async function cachedTree(): Promise<R2Tree | null> {
  return cached(TREE_CACHE_KEY, TREE_FRESH_SECONDS, listWholeTree, {
    maxStaleSeconds: 60 * 60 * 24,
  });
}

/**
 * Flat search across the whole bucket, used by the browser's search box once
 * the bucket has outgrown the tree. Paths are full keys, since the results
 * span every directory.
 */
export async function searchBucket(query: string, limit = 100): Promise<R2File[]> {
  const bucket = requireBucket();

  const needle = query.trim().toLowerCase();
  if (!needle) return [];

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
