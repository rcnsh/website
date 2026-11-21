import type { R2Listing, R2Tree } from "./r2";
import { fileKind } from "./utils.ts";

export type SortKey = "name" | "size" | "date";
export const SORT_KEYS: readonly SortKey[] = ["name", "size", "date"];

export const SEARCH_MIN = 2;

export type Entry = {
  dir: boolean;
  name: string;
  key: string;
  folder: string;
  size: number | null;
  uploaded: number | null;
  count: number | null;
};

export type FolderStat = { objects: number; bytes: number; latest: number };

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

export function parentOf(prefix: string): string {
  return prefix.replace(/[^/]*\/$/, "");
}

export function folderOf(key: string): string {
  return parentOf(key.endsWith("/") ? key : `${key}/`);
}

export function baseName(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

export function crumbs(prefix: string): { name: string; prefix: string }[] {
  const out: { name: string; prefix: string }[] = [];
  let acc = "";
  for (const segment of prefix.split("/").filter(Boolean)) {
    acc += `${segment}/`;
    out.push({ name: segment, prefix: acc });
  }
  return out;
}

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

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

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

export function matchRange(text: string, query: string): [start: number, end: number] | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const at = text.toLowerCase().indexOf(needle);
  return at < 0 ? null : [at, at + needle.length];
}

export function hashFor(path: string): string {
  return path ? `#${path.split("/").map(encodeURIComponent).join("/")}` : "";
}

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
  timeZone: "UTC",
});

export function formatDay(epochSeconds: number): string {
  return DAY.format(new Date(epochSeconds * 1000));
}
