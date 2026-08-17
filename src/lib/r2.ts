import { env } from "cloudflare:workers";

/**
 * R2 listing through the native bucket binding.
 *
 * `listWholeTree()` sends every directory with the page, so expanding a folder
 * costs no network. `listDirectory()` reads one directory at a time — it backs
 * /api/files/list, and takes over once the bucket outgrows the tree.
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

/** Above this the tree is too big to inline (~150 KB gzipped), so lazy-load instead. */
const FULL_TREE_MAX_OBJECTS = 5000;

function publicUrlFor(key: string): string {
  const base = (env.PUBLIC_BUCKET_URL || "").replace(/\/+$/, "");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return base
    ? `${base}/${encoded}`
    : `/api/files/download?key=${encodeURIComponent(key)}`;
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
      // No `include` — httpMetadata costs extra work and isn't used.
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
 * One flat pass over the bucket, folded into a listing per directory. Returns
 * null past FULL_TREE_MAX_OBJECTS, telling the caller to lazy-load instead.
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
      if (isHiddenKey(object.key)) continue;
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
