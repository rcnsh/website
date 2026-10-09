import type { R2Listing, R2Tree } from "./r2";
import { fileKind } from "./utils.ts";

// Navigation for the /files browser: path math, folder rollups, sorting,
// search and the deep-link hash. Pure, so `node --test` can load it.

export type SortKey = "name" | "size" | "date";
export const SORT_KEYS: readonly SortKey[] = ["name", "size", "date"];

/** Two characters, as /api/files/search requires. */
export const SEARCH_MIN = 2;

/** A row in a column: a folder (key ends in "/") or a file (key is the object key). */
export type Entry = {
  dir: boolean;
  name: string;
  key: string;
  /** The prefix the entry sits in. */
  folder: string;
  /** Bytes; for a folder, everything below it. Null when not known. */
  size: number | null;
  /** Epoch seconds; for a folder, the newest upload below it. */
  uploaded: number | null;
  /** Objects below a folder. Null for files, and for folders when not known. */
  count: number | null;
};

export type FolderStat = { objects: number; bytes: number; latest: number };

/** Objects, bytes and newest upload under every prefix, the root included. */
export function folderStats(tree: R2Tree): Record<string, FolderStat> {
  const stats: Record<string, FolderStat> = {};
  for (const [prefix, listing] of Object.entries(tree)) {
    let objects = 0;
    let bytes = 0;
    let latest = 0;
    for (const [, size, uploaded] of listing.files) {
      objects++;
      bytes += size;
      if (uploaded > latest) latest = uploaded;
    }
    for (let p: string | null = prefix; p !== null; p = p ? parentOf(p) : null) {
      stats[p] ??= { objects: 0, bytes: 0, latest: 0 };
      const stat = stats[p];
      stat.objects += objects;
      stat.bytes += bytes;
      if (latest > stat.latest) stat.latest = latest;
    }
  }
  return stats;
}

/** "a/b/" → "a/", "a/" → "", "" → "". */
export function parentOf(prefix: string): string {
  return prefix.replace(/[^/]*\/$/, "");
}

/** The prefix a key sits in: "a/b.txt" → "a/", "a/b/" → "a/". */
export function folderOf(key: string): string {
  return parentOf(key.endsWith("/") ? key : `${key}/`);
}

/** Last segment, without a folder's trailing slash. */
export function baseName(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

/** Each folder on the way down to `prefix`, the root excluded. */
export function crumbs(prefix: string): { name: string; prefix: string }[] {
  const out: { name: string; prefix: string }[] = [];
  let acc = "";
  for (const segment of prefix.split("/").filter(Boolean)) {
    acc += `${segment}/`;
    out.push({ name: segment, prefix: acc });
  }
  return out;
}

/**
 * Going from `from` up to its ancestor `to`, the child of `to` that was passed
 * through — so stepping out of a folder leaves that folder selected.
 */
export function childOnPath(from: string, to: string): string | null {
  if (from === to || !from.startsWith(to)) return null;
  const rest = from.slice(to.length);
  const slash = rest.indexOf("/");
  return slash < 0 ? null : to + rest.slice(0, slash + 1);
}

export function fileEntry(key: string, size: number, uploaded: number): Entry {
  return {
    dir: false,
    name: baseName(key),
    key,
    folder: folderOf(key),
    size,
    uploaded,
    count: null,
  };
}

export function listingEntries(
  prefix: string,
  listing: R2Listing,
  stats?: Record<string, FolderStat> | null,
): Entry[] {
  const folders = listing.folders.map((name): Entry => {
    const key = `${prefix}${name}/`;
    const stat = stats?.[key];
    return {
      dir: true,
      name,
      key,
      folder: prefix,
      size: stat?.bytes ?? null,
      uploaded: stat?.latest || null,
      count: stat?.objects ?? null,
    };
  });
  const files = listing.files.map(([name, size, uploaded]) =>
    fileEntry(prefix + name, size, uploaded),
  );
  return [...folders, ...files];
}

/** A file manager's order: case-blind, and 2 before 10. */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Folders first whatever the order. Name runs A→Z, size largest first, date
 * newest first; `reverse` flips the chosen order but not the folder grouping.
 * Unknown sizes and dates sort last either way.
 */
export function sortEntries(entries: readonly Entry[], sort: SortKey, reverse = false): Entry[] {
  const flip = reverse ? -1 : 1;
  const byName = (a: Entry, b: Entry) => collator.compare(a.name, b.name) || collator.compare(a.key, b.key);
  const numeric = (pick: (e: Entry) => number | null) => (a: Entry, b: Entry) => {
    const x = pick(a);
    const y = pick(b);
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1;
    return (y - x) * flip || byName(a, b);
  };
  const compare =
    sort === "name"
      ? (a: Entry, b: Entry) => byName(a, b) * flip
      : numeric(sort === "size" ? (e) => e.size : (e) => e.uploaded);

  return [...entries].sort((a, b) => (a.dir === b.dir ? compare(a, b) : a.dir ? -1 : 1));
}

export function nextSort(sort: SortKey): SortKey {
  return SORT_KEYS[(SORT_KEYS.indexOf(sort) + 1) % SORT_KEYS.length];
}

/** Every file whose full key contains the query, case-blind. Empty below SEARCH_MIN. */
export function searchTree(tree: R2Tree, query: string): Entry[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < SEARCH_MIN) return [];
  const out: Entry[] = [];
  for (const [prefix, listing] of Object.entries(tree)) {
    for (const [name, size, uploaded] of listing.files) {
      const key = prefix + name;
      if (key.toLowerCase().includes(needle)) out.push(fileEntry(key, size, uploaded));
    }
  }
  return out;
}

/** Where the query falls in `text`, for highlighting; null when it does not. */
export function matchRange(text: string, query: string): [start: number, end: number] | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const at = text.toLowerCase().indexOf(needle);
  return at < 0 ? null : [at, at + needle.length];
}

/** Deep link for a folder (prefix) or a file (key). Segments are encoded, slashes kept. */
export function hashFor(path: string): string {
  return path ? `#${path.split("/").map(encodeURIComponent).join("/")}` : "";
}

/**
 * Reads a deep link back. A folder is opened; a file opens its folder with
 * the file selected. Anything that could walk out of the bucket is the root.
 */
export function parseHash(hash: string): { prefix: string; file: string | null } {
  const raw = hash.replace(/^#/, "");
  if (!raw) return { prefix: "", file: null };
  let segments: string[];
  try {
    segments = raw.split("/").map(decodeURIComponent);
  } catch {
    return { prefix: "", file: null };
  }
  const last = segments.pop() ?? "";
  if (segments.some((s) => s === "" || s === "." || s === "..") || last === "." || last === "..") {
    return { prefix: "", file: null };
  }
  const prefix = segments.length ? `${segments.join("/")}/` : "";
  return last ? { prefix, file: prefix + last } : { prefix, file: null };
}

export type FileKind = ReturnType<typeof fileKind>;

export type KindTotal = { kind: FileKind; objects: number; bytes: number };

/** Objects and bytes per kind of file across the bucket, largest share first. */
export function kindTotals(tree: R2Tree): KindTotal[] {
  const totals = new Map<FileKind, KindTotal>();
  for (const listing of Object.values(tree)) {
    for (const [name, size] of listing.files) {
      const kind = fileKind(name);
      const total = totals.get(kind) ?? { kind, objects: 0, bytes: 0 };
      total.objects++;
      total.bytes += size;
      totals.set(kind, total);
    }
  }
  return [...totals.values()].sort((a, b) => b.bytes - a.bytes || b.objects - a.objects);
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  // Pinned: the island renders on the Worker and hydrates in the reader's
  // zone, and a date that moves between the two is a hydration mismatch.
  timeZone: "UTC",
});

/** An upload time (epoch seconds) as a day, the same on server and client. */
export function formatDay(epochSeconds: number): string {
  return DAY.format(new Date(epochSeconds * 1000));
}
