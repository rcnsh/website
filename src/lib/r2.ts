import { env } from "cloudflare:workers";

/**
 * R2 listing through the native bucket binding.
 *
 * Two modes:
 *
 *  - `listWholeTree()` walks the bucket once and returns every directory's
 *    listing up front, so the browser can expand folders with no network at
 *    all. This is the normal path — the bucket is a few hundred objects and
 *    the whole tree is ~10 KB gzipped, where lazy-loading cost a 250–860 ms
 *    round trip on every first expand.
 *
 *  - `listDirectory()` reads one directory at a time using `delimiter`. It's
 *    the fallback for when the bucket grows past FULL_TREE_MAX_OBJECTS, and
 *    still backs the /api/files/list endpoint.
 *
 * The old site did neither well: it pulled the entire index over the S3 API on
 * every request, rebuilt the tree per render, and silently truncated at 1000
 * objects because it never paginated.
 */

export type R2File = {
  type: "file";
  name: string;
  key: string;
  size: number;
  uploaded: string;
  url: string;
};

export type R2Folder = {
  type: "folder";
  name: string;
  prefix: string;
};

export type R2Listing = {
  prefix: string;
  folders: R2Folder[];
  files: R2File[];
  truncated: boolean;
};

/** Every directory in the bucket, keyed by prefix ("" is the root). */
export type R2Tree = Record<string, R2Listing>;

/**
 * Above this, shipping the whole tree to the client stops being a win and we
 * fall back to lazy loading. At ~157 bytes of JSON per entry, 5000 objects is
 * roughly 780 KB raw / 150 KB gzipped — past what's reasonable to inline.
 */
const FULL_TREE_MAX_OBJECTS = 5000;

function publicUrlFor(key: string): string {
  const base = (env.PUBLIC_BUCKET_URL || "").replace(/\/+$/, "");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return base ? `${base}/${encoded}` : `/api/files/download?key=${encodeURIComponent(key)}`;
}

/**
 * Dot-prefixed entries are hidden from the public browser, the same way `ls`
 * hides them. The bucket has `.thumb` (a thumbnail cache) and `.aashare` in it,
 * which are tooling artefacts rather than things worth listing. Delete this
 * and its two call sites to show everything.
 */
function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/** Rejects `..`, absolute paths, and anything that isn't a clean prefix. */
export function normalisePrefix(input: string | null | undefined): string {
  if (!input) return "";
  const cleaned = input.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (cleaned.split("/").includes("..")) return "";
  if (!cleaned) return "";
  return cleaned.endsWith("/") ? cleaned : `${cleaned}/`;
}

export async function listDirectory(prefix = ""): Promise<R2Listing> {
  const bucket = env.BUCKET;
  if (!bucket) {
    throw new Error(
      "R2 binding `BUCKET` is missing. Check the r2_buckets entry in wrangler.jsonc.",
    );
  }

  const folders = new Map<string, R2Folder>();
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
      // No `include`: only key/size/uploaded are used, and asking for
      // httpMetadata makes R2 do extra work on every list.
    });

    for (const delimited of result.delimitedPrefixes) {
      const name = delimited.slice(prefix.length).replace(/\/$/, "");
      if (!name || isHidden(name)) continue;
      folders.set(delimited, { type: "folder", name, prefix: delimited });
    }

    for (const object of result.objects) {
      const name = object.key.slice(prefix.length);
      // Skip the zero-byte markers some clients create to fake a directory.
      if (!name || name.includes("/")) continue;
      if (object.size === 0) continue;
      if (isHidden(name)) continue;

      files.push({
        type: "file",
        name,
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        url: publicUrlFor(object.key),
      });
    }

    if (!result.truncated) break;
    cursor = result.cursor;
    if (page === 19) truncated = true;
  }

  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

  return {
    prefix,
    folders: [...folders.values()].sort((a, b) => collator.compare(a.name, b.name)),
    files: files.sort((a, b) => collator.compare(a.name, b.name)),
    truncated,
  };
}

/**
 * One flat pass over the bucket, folded into a listing per directory.
 *
 * Returns null when the bucket is larger than FULL_TREE_MAX_OBJECTS, which
 * tells the caller to fall back to per-directory lazy loading.
 */
export async function listWholeTree(): Promise<R2Tree | null> {
  const bucket = env.BUCKET;
  if (!bucket) {
    throw new Error(
      "R2 binding `BUCKET` is missing. Check the r2_buckets entry in wrangler.jsonc.",
    );
  }

  const tree: R2Tree = {
    "": { prefix: "", folders: [], files: [], truncated: false },
  };
  const ensure = (prefix: string): R2Listing =>
    (tree[prefix] ??= { prefix, folders: [], files: [], truncated: false });

  const seenFolders = new Set<string>();
  let count = 0;
  let cursor: string | undefined;

  while (true) {
    const result = await bucket.list({ limit: 1000, cursor });

    for (const object of result.objects) {
      // Directory markers and hidden paths never make it into the tree.
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
          ensure(prefix).folders.push({
            type: "folder",
            name: segment,
            prefix: childPrefix,
          });
        }
        prefix = childPrefix;
      }

      ensure(prefix).files.push({
        type: "file",
        name: fileName,
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        url: publicUrlFor(object.key),
      });
    }

    if (!result.truncated) break;
    cursor = result.cursor;
  }

  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  for (const listing of Object.values(tree)) {
    listing.folders.sort((a, b) => collator.compare(a.name, b.name));
    listing.files.sort((a, b) => collator.compare(a.name, b.name));
  }

  return tree;
}

/** Flat search across the whole bucket, used by the browser's search box. */
export async function searchBucket(query: string, limit = 100): Promise<R2File[]> {
  const bucket = env.BUCKET;
  if (!bucket) throw new Error("R2 binding `BUCKET` is missing.");

  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: R2File[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 20 && matches.length < limit; page++) {
    const result = await bucket.list({ limit: 1000, cursor });

    for (const object of result.objects) {
      if (object.size === 0 || object.key.endsWith("/")) continue;
      // Hidden anywhere in the path, so `.thumb/x.png` stays out of results.
      if (object.key.split("/").some(isHidden)) continue;
      if (!object.key.toLowerCase().includes(needle)) continue;

      matches.push({
        type: "file",
        name: object.key.split("/").pop() ?? object.key,
        key: object.key,
        size: object.size,
        uploaded: object.uploaded.toISOString(),
        url: publicUrlFor(object.key),
      });

      if (matches.length >= limit) break;
    }

    if (!result.truncated) break;
    cursor = result.cursor;
  }

  return matches;
}
