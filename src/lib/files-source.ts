import type { R2File, R2Listing, R2Tree } from "./r2.ts";
import { type Entry, fileEntry, type FolderStat, folderStats, searchTree } from "./files-nav.ts";
import { type Visibility, type VisibilityRules, visibilityOf } from "../../shared/visibility.ts";

// Where the /files browser's listings come from. The island ships either the
// whole tree ("complete": nothing is ever fetched) or only the root ("lazy":
// each folder and every search is a request). Callers never see which. Once
// mounted, the browser asks /api/files/visibility whether the reader is the
// owner, and if so swaps the visitors' listings for the owner's.
// No DOM and no React, so `node --test` drives it through an injected fetch.

/** One immutable state of the source, safe to render from. */
export type FilesView = {
  listing(prefix: string): R2Listing | undefined;
  loading(prefix: string): boolean;
  /** Without this a failed fetch renders identically to an empty folder. */
  failed(prefix: string): boolean;
  /** The root has never arrived, or its last fetch failed. */
  rootError: boolean;
  /** Rollups under every prefix; only when the whole tree is here. */
  stats: Record<string, FolderStat> | null;
  /** Folder settings, present only for the owner. */
  rules: VisibilityRules | null;
  owner: boolean;
  /** The owner check has settled, either way. */
  accessChecked: boolean;
  /** Where a file's bytes come from: the bucket's domain, or for a private one the owner-checked route. */
  baseFor(key: string): string;
  /** A tag for anything a visitor would not see listed; owner only. */
  tagFor(key: string): Visibility | null;
  /**
   * Where a deep link lands, or null when the folder is not in the tree. A
   * link to a folder without its trailing slash still opens the folder.
   */
  locate(prefix: string, file: string | null): { prefix: string; file: string | null } | null;
};

export type FilesSource = {
  getSnapshot(): FilesView;
  subscribe(listener: () => void): () => void;
  /** Fetches a folder unless it is here, in flight, or (without `retry`) failed. */
  load(prefix: string, options?: { retry?: boolean }): Promise<void>;
  /** Results now when the tree is here, or later from the server. Rejects on failure or abort. */
  search(term: string, signal: AbortSignal): Entry[] | Promise<Entry[]>;
  /** The owner upgrade. Runs once; `onSettled` is called exactly once on every path. */
  checkAccess(): Promise<void>;
  /** Owner only. Throws when the change was not saved. */
  setVisibility(prefix: string, visibility: Visibility | null): Promise<void>;
  /** Stops state updates; the access check still settles. */
};

export type FilesSourceOptions = {
  fetch: typeof fetch;
  /** Whole bucket, keyed by prefix. Null once the bucket is too big to inline. */
  tree: R2Tree | null;
  initial: R2Listing | null;
  bucketUrl: string;
  /** Hands the owner's tree to the page's other islands. */
  publish?: (tree: R2Tree) => void;
  /** The check is over; `published` says whether the owner's tree went out. */
  onSettled?: (published: boolean) => void;
  searchDelayMs?: number;
};

type State = {
  listings: Record<string, R2Listing>;
  loading: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  rootError: boolean;
  rules: VisibilityRules | null;
  accessChecked: boolean;
};

const SEARCH_DELAY_MS = 280;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const withKey = (set: ReadonlySet<string>, key: string) => new Set(set).add(key);
const withoutKey = (set: ReadonlySet<string>, key: string) => {
  if (!set.has(key)) return set;
  const next = new Set(set);
  next.delete(key);
  return next;
};

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export function createFilesSource(options: FilesSourceOptions): FilesSource {
  const { fetch, tree, initial, bucketUrl, publish, onSettled } = options;
  const searchDelay = options.searchDelayMs ?? SEARCH_DELAY_MS;
  const complete = tree !== null;

  let state: State = {
    listings: tree ?? (initial ? { "": initial } : {}),
    loading: new Set(),
    failed: new Set(),
    rootError: !tree && !initial,
    rules: null,
    accessChecked: false,
  };
  // Bumped when the owner's view replaces the visitors', so a folder fetched
  // for the visitor and landing after the swap is dropped.
  let generation = 0;
  let access: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  let stats: { of: Record<string, R2Listing>; value: Record<string, FolderStat> } | null = null;
  const statsOf = (listings: Record<string, R2Listing>) => {
    if (stats?.of !== listings) stats = { of: listings, value: folderStats(listings) };
    return stats.value;
  };

  const viewOf = (s: State): FilesView => {
    const rules = s.rules;
    return {
      listing: (prefix) => s.listings[prefix],
      loading: (prefix) => s.loading.has(prefix),
      failed: (prefix) => s.failed.has(prefix),
      rootError: s.rootError,
      stats: complete ? statsOf(s.listings) : null,
      rules,
      owner: rules !== null,
      accessChecked: s.accessChecked,
      baseFor: (key) => (rules && visibilityOf(rules, key) === "private" ? "" : bucketUrl),
      tagFor: (key) => {
        if (!rules) return null;
        const visibility = visibilityOf(rules, key);
        return visibility === "listed" ? null : visibility;
      },
      locate: (prefix, file) => {
        if (!complete) return { prefix, file };
        if (file && s.listings[`${file}/`]) return { prefix: `${file}/`, file: null };
        return s.listings[prefix] ? { prefix, file } : null;
      },
    };
  };
  let view = viewOf(state);

  const update = (change: (s: State) => Partial<State>) => {
    state = { ...state, ...change(state) };
    view = viewOf(state);
    for (const listener of listeners) listener();
  };

  async function load(prefix: string, { retry = false } = {}): Promise<void> {
    if (complete || state.listings[prefix] || state.loading.has(prefix)) return;
    if (state.failed.has(prefix) && !retry) return;
    const started = generation;
    update((s) => ({ loading: withKey(s.loading, prefix), failed: withoutKey(s.failed, prefix) }));
    try {
      const response = await fetch(`/api/files/list?prefix=${encodeURIComponent(prefix)}`);
      // A 429 and a 500 both arrive as JSON, and neither is an empty folder.
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as R2Listing & { error?: boolean };
      if (data.error) throw new Error("listing unavailable");
      if (started !== generation) return;
      update((s) => ({
        listings: { ...s.listings, [prefix]: data },
        rootError: prefix === "" ? false : s.rootError,
      }));
    } catch {
      if (started !== generation) return;
      update((s) => ({ failed: withKey(s.failed, prefix), rootError: prefix === "" ? true : s.rootError }));
    } finally {
      if (started === generation) update((s) => ({ loading: withoutKey(s.loading, prefix) }));
    }
  }

  function search(term: string, signal: AbortSignal): Entry[] | Promise<Entry[]> {
    if (complete) return searchTree(state.listings, term);
    return (async () => {
      await delay(searchDelay, signal);
      const response = await fetch(`/api/files/search?q=${encodeURIComponent(term)}`, { signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { files?: R2File[]; error?: boolean };
      if (data.error) throw new Error("search unavailable");
      return (data.files ?? []).map(([key, size, uploaded]) => fileEntry(key, size, uploaded));
    })();
  }

  async function upgrade(): Promise<boolean> {
    try {
      const response = await fetch("/api/files/visibility", { cache: "no-store" });
      if (!response.ok) return false;
      const data: unknown = await response.json();
      if (!isObject(data) || data.owner !== true || !isObject(data.rules)) return false;
      const rules = data.rules as VisibilityRules;
      const ownerTree = complete && isObject(data.tree) ? (data.tree as R2Tree) : null;
      generation++;
      if (complete) {
        update((s) => ({ rules, listings: ownerTree ?? s.listings }));
      } else {
        // What lazy mode fetched so far was the visitors' view; start over.
        update(() => ({ rules, listings: {}, failed: new Set(), loading: new Set() }));
      }
      if (!ownerTree) return false;
      publish?.(ownerTree);
      return true;
    } catch {
      // Not signed in, or offline: the visitors' view stands.
      return false;
    }
  }

  function checkAccess(): Promise<void> {
    access ??= upgrade().then((published) => {
      update(() => ({ accessChecked: true }));
      onSettled?.(published);
    });
    return access;
  }

  async function setVisibility(prefix: string, visibility: Visibility | null): Promise<void> {
    const response = await fetch("/api/files/visibility", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prefix, visibility }),
    });
    const data = (await response.json().catch(() => ({}))) as { rules?: VisibilityRules };
    if (!response.ok || !isObject(data.rules)) throw new Error(String(response.status));
    const rules = data.rules;
    update(() => ({ rules }));
  }

  return {
    getSnapshot: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
    search,
    checkAccess,
    setVisibility,
  };
}
