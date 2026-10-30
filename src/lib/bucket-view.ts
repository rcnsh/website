import { hiddenTotals, type HiddenTotals } from "./bucket-totals.ts";
import { kindTotals } from "./files-nav.ts";
import type { R2File, R2Listing, R2Tree } from "./r2";
import { listedListing, listedTree } from "./visible-tree.ts";
import { folderPrefix, isHidden, isHiddenKey } from "../../shared/bucket-keys.ts";
import {
  decideRead,
  rulesVersion,
  visibilityOf,
  type ReadDecision,
  type VisibilityRules,
} from "../../shared/visibility.ts";

// The bucket as one reader may see it. Everything that lists, searches or
// reads the bucket for a response goes through a view, so the unfiltered
// bucket is reachable only by asking as the owner. lib/bucket binds it to R2,
// KV and D1; this file stays loadable under `node --test`.

/** The slice of an R2 listing this module reads. */
export type BucketPage = {
  objects: { key: string; size: number; uploaded: Date }[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
};

export type BucketDeps = {
  list: (options: { prefix?: string; delimiter?: string; limit: number; cursor?: string }) => Promise<BucketPage>;
  /** Stale-while-revalidate around the whole-bucket pass. */
  cacheTree: (load: () => Promise<R2Tree | null>) => Promise<R2Tree | null>;
  rules: () => Promise<VisibilityRules>;
};

/** Whether the reader is the owner: settled, or asked only once a decision needs it. */
export type Reader = boolean | (() => Promise<boolean>);

/** What the public /files island shows: the visitor's bucket, plus sizes only of the rest. */
export type PublicSummary = {
  tree: R2Tree | null;
  root: R2Listing | null;
  hidden: HiddenTotals | null;
  /** Kinds in the whole bucket, so the usage bar can hold room for the owner's. */
  ownerSlots: number;
};

/** Above this the tree is too big to inline, even packed, so lazy-load instead. */
const FULL_TREE_MAX_OBJECTS = 5000;

const SEARCH_LIMIT = 100;

/** Sorts the way a file manager does: case-blind, and 2 before 10. */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const EMPTY: R2Listing = { folders: [], files: [] };

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function createBucket({ list, cacheTree, rules }: BucketDeps) {
  async function listDirectory(prefix: string): Promise<R2Listing> {
    const folders = new Set<string>();
    const files: R2File[] = [];

    let cursor: string | undefined;
    let truncated = false;
    // Bounded so a pathological bucket can't spin here forever.
    for (let page = 0; page < 20; page++) {
      const result = await list({ prefix, delimiter: "/", limit: 1000, cursor });

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
   * One flat pass over the bucket, folded into a listing per directory. Null
   * past FULL_TREE_MAX_OBJECTS, telling the caller to lazy-load instead.
   */
  async function listWholeTree(): Promise<R2Tree | null> {
    const tree: R2Tree = { "": { folders: [], files: [] } };
    const ensure = (prefix: string): R2Listing => (tree[prefix] ??= { folders: [], files: [] });

    const seenFolders = new Set<string>();
    let count = 0;
    let cursor: string | undefined;

    // Page cap as well as FULL_TREE_MAX_OBJECTS: a bucket full of zero-byte or
    // hidden keys advances the cursor without ever incrementing the count.
    let exhausted = false;
    for (let page = 0; page < 20; page++) {
      const result = await list({ limit: 1000, cursor });

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

        ensure(prefix).files.push([fileName, object.size, toEpochSeconds(object.uploaded)]);
      }

      if (!result.truncated) {
        exhausted = true;
        break;
      }
      cursor = result.cursor;
    }

    // Still truncated means an incomplete tree, which the caller would cache and
    // serve as the whole bucket. `null` sends it down the lazy-load path instead.
    if (!exhausted) return null;

    for (const listing of Object.values(tree)) {
      listing.folders.sort(collator.compare);
      listing.files.sort((a, b) => collator.compare(a[0], b[0]));
    }

    return tree;
  }

  const fullTree = () => cacheTree(listWholeTree);

  /** A bounded walk over the bucket itself, for when it is too big to tree. */
  async function scan(needle: string, include: (key: string) => boolean): Promise<R2File[]> {
    const matches: R2File[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 20 && matches.length < SEARCH_LIMIT; page++) {
      const result = await list({ limit: 1000, cursor });

      for (const object of result.objects) {
        if (object.size === 0 || object.key.endsWith("/")) continue;
        if (isHiddenKey(object.key)) continue;
        if (!object.key.toLowerCase().includes(needle) || !include(object.key)) continue;

        matches.push([object.key, object.size, toEpochSeconds(object.uploaded)]);
        if (matches.length >= SEARCH_LIMIT) break;
      }

      if (!result.truncated) break;
      cursor = result.cursor;
    }

    return matches;
  }

  /**
   * Answered out of the cached tree, not R2: search is unauthenticated, so a
   * live pass would be a bucket scan anyone can start. `include` filters
   * before the limit, so keys the reader may not see do not use it up.
   */
  async function searchKeys(query: string, include: (key: string) => boolean): Promise<R2File[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const tree = await fullTree();
    if (!tree) return scan(needle, include);

    const matches: R2File[] = [];
    for (const [prefix, listing] of Object.entries(tree)) {
      for (const [name, size, uploaded] of listing.files) {
        const key = `${prefix}${name}`;
        if (!key.toLowerCase().includes(needle) || !include(key)) continue;

        matches.push([key, size, uploaded]);
        if (matches.length >= SEARCH_LIMIT) return matches;
      }
    }
    return matches;
  }

  /** The bucket as `reader` may see it. */
  function view(reader: Reader) {
    let asked: Promise<boolean> | null = null;
    const isOwner = () => (asked ??= typeof reader === "function" ? reader() : Promise.resolve(reader));

    return {
      /** The whole tree, or null when the bucket is too big to inline. */
      async tree(): Promise<R2Tree | null> {
        const tree = await fullTree();
        if (!tree || (await isOwner())) return tree;
        return listedTree(tree, await rules());
      },

      /** One directory, or null when `raw` names no folder anyone may list. */
      async listing(raw: string | null | undefined): Promise<R2Listing | null> {
        const prefix = folderPrefix(raw);
        if (prefix === null) return null;
        const owner = await isOwner();
        const tree = await fullTree();
        if (!tree) {
          const listing = await listDirectory(prefix);
          return owner ? listing : listedListing(prefix, listing, await rules());
        }
        return (owner ? tree : listedTree(tree, await rules()))[prefix] ?? EMPTY;
      },

      /** Files whose full key contains `query`; paths are full keys. */
      async search(query: string): Promise<R2File[]> {
        if (await isOwner()) return searchKeys(query, () => true);
        const current = await rules();
        return searchKeys(query, (key) => visibilityOf(current, key) === "listed");
      },

      /** Whether this reader may fetch the object at `key`. */
      canRead(key: string | null | undefined): Promise<ReadDecision> {
        return decideRead(key, rules, isOwner);
      },
    };
  }

  /**
   * The visitor's view for the publicly cached island, with what the rest of
   * the bucket holds as totals only, never names.
   */
  async function publicSummary(): Promise<PublicSummary> {
    const [full, current] = await Promise.all([fullTree(), rules()]);
    if (!full) {
      return { tree: null, root: listedListing("", await listDirectory(""), current), hidden: null, ownerSlots: 0 };
    }
    const tree = listedTree(full, current);
    return { tree, root: tree[""] ?? null, hidden: hiddenTotals(full, tree), ownerSlots: kindTotals(full).length };
  }

  /** Changes whenever the rules do, for cache keys over visitor answers. */
  async function version(): Promise<string> {
    return rulesVersion(await rules());
  }

  return { view, publicSummary, version };
}

export type BucketView = ReturnType<ReturnType<typeof createBucket>["view"]>;
