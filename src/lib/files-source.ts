import type { R2File, R2Listing, R2Tree } from "./r2.ts";
import { type Entry, fileEntry, type FolderStat, folderStats, searchTree } from "./files-nav.ts";
import { type Visibility, type VisibilityRules, visibilityOf } from "../../shared/visibility.ts";

export type FilesView = {
  listing(prefix: string): R2Listing | undefined;
  loading(prefix: string): boolean;
  failed(prefix: string): boolean;
  rootError: boolean;
  stats: Record<string, FolderStat> | null;
  rules: VisibilityRules | null;
  owner: boolean;
  accessChecked: boolean;
  baseFor(key: string): string;
  tagFor(key: string): Visibility | null;
  locate(prefix: string, file: string | null): { prefix: string; file: string | null } | null;
};

export type FilesSource = {
  getSnapshot(): FilesView;
  subscribe(listener: () => void): () => void;
  load(prefix: string, options?: { retry?: boolean }): Promise<void>;
  search(term: string, signal: AbortSignal): Entry[] | Promise<Entry[]>;
  checkAccess(): Promise<void>;
  setVisibility(prefix: string, visibility: Visibility | null): Promise<void>;
};

export type FilesSourceOptions = {
  fetch: typeof fetch;
  tree: R2Tree | null;
  initial: R2Listing | null;
  bucketUrl: string;
  publish?: (tree: R2Tree) => void;
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
        update(() => ({ rules, listings: {}, failed: new Set(), loading: new Set() }));
      }
      if (!ownerTree) return false;
      publish?.(ownerTree);
      return true;
    } catch {
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
