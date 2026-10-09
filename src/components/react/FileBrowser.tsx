import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { R2File, R2Listing, R2Tree } from "@/lib/r2";
import {
  baseName,
  childOnPath,
  crumbs,
  type Entry,
  fileEntry,
  folderStats,
  formatDay,
  hashFor,
  listingEntries,
  matchRange,
  nextSort,
  parentOf,
  parseHash,
  SEARCH_MIN,
  searchTree,
  type SortKey,
  SORT_KEYS,
  sortEntries,
} from "@/lib/files-nav";
import { clampIndex, keyAction } from "@/lib/files-keys";
import { isTextPreviewable } from "@/lib/text-preview";
import { publicUrl } from "@/lib/thumbs";
import { fileKind, formatBytes } from "@/lib/utils";
import MediaPreview, {
  Backfill,
  DetailList,
  Fallback,
  previewKind,
} from "@/components/react/MediaPreview";
import { CardThumb, EntryIcon, ImagePreview, TextPreview } from "@/components/files/Previews";
import {
  ArrowDownIcon,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  GridIcon,
  LinkIcon,
  ListIcon,
  SearchIcon,
} from "@/components/files/icons";

type Props = {
  /** Whole bucket, keyed by prefix. Null once the bucket is too big to inline. */
  tree: R2Tree | null;
  initial: R2Listing | null;
  bucketUrl: string;
};

type View = "list" | "grid";

/** Rows drawn at first; a big folder grows the window as the selection walks down. */
const WINDOW = 200;

/** Children listed in a folder's preview. */
const FOLDER_PEEK = 12;

/** How long a folder must stay selected before its listing is fetched. */
const PEEK_DELAY_MS = 250;

const count = (n: number) => n.toLocaleString("en-GB");
const plural = (n: number, word: string) => `${count(n)} ${word}${n === 1 ? "" : "s"}`;

export default function FileBrowser({ tree, initial, bucketUrl }: Props) {
  // With a tree, every directory is already here and nothing is ever fetched.
  const complete = tree !== null;
  const [listings, setListings] = useState<Record<string, R2Listing>>(
    () => tree ?? (initial ? { "": initial } : {}),
  );
  const [loading, setLoading] = useState<Set<string>>(new Set());
  // Without this a failed fetch renders identically to an empty folder.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [rootError, setRootError] = useState(!tree && !initial);
  const stats = useMemo(() => (complete ? folderStats(listings) : null), [complete, listings]);

  const [cwd, setCwd] = useState("");
  /** The selected key in each folder visited, so stepping back restores it. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortKey>("name");
  const [reverse, setReverse] = useState(false);
  const [view, setView] = useState<View>("list");
  const [limit, setLimit] = useState(WINDOW);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[] | null>(null);
  const [resultPick, setResultPick] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // Otherwise a search that never ran reads as "Nothing matches".
  const [searchFailed, setSearchFailed] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  const root = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const curCol = useRef<HTMLDivElement>(null);
  const parentCol = useRef<HTMLDivElement>(null);
  const playback = useRef<(() => void) | null>(null);

  const load = useCallback(
    async (prefix: string) => {
      if (complete || listings[prefix] || loading.has(prefix)) return;
      setLoading((prev) => new Set(prev).add(prefix));
      setFailed((prev) => {
        if (!prev.has(prefix)) return prev;
        const next = new Set(prev);
        next.delete(prefix);
        return next;
      });
      try {
        const response = await fetch(`/api/files/list?prefix=${encodeURIComponent(prefix)}`);
        // A 429 and a 500 both arrive as JSON, and neither is an empty folder.
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as R2Listing & { error?: boolean };
        if (data.error) throw new Error("listing unavailable");
        setListings((prev) => ({ ...prev, [prefix]: data }));
        if (prefix === "") setRootError(false);
      } catch {
        setFailed((prev) => new Set(prev).add(prefix));
        if (prefix === "") setRootError(true);
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(prefix);
          return next;
        });
      }
    },
    [complete, listings, loading],
  );

  // The current folder and its parent, whenever either is missing. Failed
  // ones wait for the retry button rather than looping.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the folder, not on `load`'s identity
  useEffect(() => {
    if (complete) return;
    if (!listings[cwd] && !failed.has(cwd)) void load(cwd);
    const parent = parentOf(cwd);
    if (cwd && !listings[parent] && !failed.has(parent)) void load(parent);
  }, [cwd, complete]);

  /* ---- Search ---- */

  useEffect(() => {
    const term = query.trim();
    setResultPick(null);
    if (term.length < SEARCH_MIN) {
      setResults(null);
      setSearching(false);
      setSearchFailed(false);
      return;
    }

    if (complete) {
      setResults(searchTree(listings, term));
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchFailed(false);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/files/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { files: R2File[]; error?: boolean };
        if (data.error) throw new Error("search unavailable");
        setResults((data.files ?? []).map(([key, size, uploaded]) => fileEntry(key, size, uploaded)));
        setSearchFailed(false);
      } catch {
        // An abort is us superseding the request, not a failure.
        if (controller.signal.aborted) return;
        setSearchFailed(true);
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, complete, listings]);

  const searchActive = results !== null || searching || searchFailed;

  /* ---- What is on screen ---- */

  const listing = listings[cwd];
  const items = useMemo(() => {
    if (results) return sortEntries(results, sort, reverse);
    if (!listing) return [];
    return sortEntries(listingEntries(cwd, listing, stats), sort, reverse);
  }, [results, listing, cwd, stats, sort, reverse]);

  const pickedKey = results ? resultPick : picked[cwd];
  const found = pickedKey ? items.findIndex((e) => e.key === pickedKey) : -1;
  const index = clampIndex(found < 0 ? 0 : found, items.length);
  const selected = index >= 0 ? items[index] : null;

  // Reset the window whenever the list itself is replaced.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately keyed on the list's identity
  useEffect(() => setLimit(WINDOW), [cwd, results]);
  const shown = items.slice(0, Math.max(limit, index + 60));

  /* ---- Moving ---- */

  const select = useCallback(
    (i: number) => {
      const target = items[clampIndex(i, items.length)];
      if (!target) return;
      if (results) setResultPick(target.key);
      else setPicked((prev) => ({ ...prev, [cwd]: target.key }));
    },
    [items, results, cwd],
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults(null);
    setSearching(false);
    setSearchFailed(false);
  }, []);

  const go = useCallback(
    (prefix: string, focusKey?: string) => {
      clearSearch();
      const passed = childOnPath(cwd, prefix);
      const keep = focusKey ?? passed;
      if (keep) setPicked((prev) => ({ ...prev, [prefix]: keep }));
      setCwd(prefix);
    },
    [cwd, clearSearch],
  );

  const open = useCallback(() => {
    if (!selected) return;
    if (selected.dir) go(selected.key);
    else if (results) go(selected.folder, selected.key);
    else playback.current?.();
  }, [selected, results, go]);

  const up = useCallback(() => {
    if (searchActive) clearSearch();
    else if (cwd) go(parentOf(cwd));
  }, [searchActive, cwd, go, clearSearch]);

  const focusList = () => list.current?.focus({ preventScroll: true });

  const linkFor = useCallback(
    (entry: Entry) =>
      entry.dir
        ? `${window.location.origin}${window.location.pathname}${hashFor(entry.key)}`
        : new URL(publicUrl(bucketUrl, entry.key), window.location.href).href,
    [bucketUrl],
  );

  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  const copyLink = useCallback(
    async (entry: Entry | null = selected) => {
      if (!entry) return;
      try {
        await navigator.clipboard.writeText(linkFor(entry));
        setCopied(entry.key);
        window.clearTimeout(copyTimer.current);
        copyTimer.current = window.setTimeout(() => setCopied(null), 1500);
      } catch {
        // Clipboard blocked — the link itself still works.
      }
    },
    [selected, linkFor],
  );

  /* ---- Deep links ---- */

  const applyHash = useCallback(() => {
    const { prefix, file } = parseHash(window.location.hash);
    if (complete) {
      // A link to a folder without its trailing slash still opens the folder.
      if (file && listings[`${file}/`]) {
        setCwd(`${file}/`);
        return;
      }
      if (!listings[prefix]) return;
    }
    setCwd(prefix);
    if (file) setPicked((prev) => ({ ...prev, [prefix]: file }));
  }, [complete, listings]);

  const hashApplied = useRef(false);
  // Layout effect so a deep link is in place before the first paint after
  // hydration, not one frame after it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useLayoutEffect(() => {
    applyHash();
    hashApplied.current = true;
    const onHash = () => {
      clearSearch();
      applyHash();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Search results are a view, not a place, so they leave the link alone.
  const linkPath = results ? null : selected && !selected.dir ? selected.key : cwd;
  useEffect(() => {
    if (!hashApplied.current || linkPath === null) return;
    const hash = hashFor(linkPath);
    if (hash === window.location.hash || (!hash && !window.location.hash)) return;
    // Replace, not push: walking a folder with j/k would bury the back button.
    history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
  }, [linkPath]);

  /* ---- Keeping the selection in view ---- */

  // scrollIntoView would scroll the page too; only the column should move.
  const scrollIn = (column: HTMLElement | null, element: HTMLElement | null | undefined) => {
    if (!column || !element) return;
    const top = element.offsetTop - 44;
    const bottom = element.offsetTop + element.offsetHeight + 8;
    if (top < column.scrollTop) column.scrollTop = top;
    else if (bottom > column.scrollTop + column.clientHeight) column.scrollTop = bottom - column.clientHeight;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selection or layout moves
  useLayoutEffect(() => {
    scrollIn(curCol.current, list.current?.querySelector<HTMLElement>('[aria-selected="true"]'));
  }, [index, view, cwd, results]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the folder changes
  useLayoutEffect(() => {
    scrollIn(parentCol.current, parentCol.current?.querySelector<HTMLElement>(".on"));
  }, [cwd, listings]);

  // A folder's preview lists its children; without the tree that is a fetch,
  // so it waits until the selection settles.
  const peek = selected?.dir ? selected.key : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the folder
  useEffect(() => {
    if (complete || !peek || listings[peek] || failed.has(peek)) return;
    const timer = setTimeout(() => void load(peek), PEEK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [peek, complete]);

  /* ---- Keys ---- */

  const gridColumns = () => {
    const cards = list.current?.querySelectorAll<HTMLElement>(".fb-card");
    if (!cards?.length) return 1;
    const top = cards[0].offsetTop;
    let n = 0;
    for (const card of cards) {
      if (card.offsetTop !== top) break;
      n++;
    }
    return n;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const done = () => {
      event.preventDefault();
      // Stops "/" reaching the palette's window listener while in here.
      event.stopPropagation();
    };

    if (target === search.current) {
      if (event.key === "Escape") {
        if (query) clearSearch();
        else focusList();
        done();
      } else if (event.key === "ArrowDown" || event.key === "Enter") {
        focusList();
        if (event.key === "Enter" && results?.length) open();
        done();
      }
      return;
    }
    // Controls with keys of their own.
    if (target.closest("input, textarea, select, [contenteditable], video, audio, [role='slider']")) return;
    if (target.closest("button, a") && (event.key === "Enter" || event.key === " ")) return;

    const action = keyAction(event, { view, columns: gridColumns() });
    if (!action) return;

    switch (action.type) {
      case "move":
        select(index + action.by);
        return done();
      case "first":
        select(0);
        return done();
      case "last":
        select(items.length - 1);
        return done();
      case "open":
        open();
        return done();
      case "up":
        up();
        return done();
      case "search":
        search.current?.focus();
        search.current?.select();
        return done();
      case "sort":
        setSort((s) => nextSort(s));
        setReverse(false);
        return done();
      case "reverse":
        setReverse((r) => !r);
        return done();
      case "view":
        setView((v) => (v === "list" ? "grid" : "list"));
        return done();
      case "copy":
        void copyLink();
        return done();
      case "toggle-play":
        if (!playback.current) return;
        playback.current();
        return done();
      case "escape":
        if (!searchActive) return;
        clearSearch();
        focusList();
        return done();
    }
  };

  const onPick = (i: number) => {
    focusList();
    // A second tap on a touch screen opens; a mouse double-clicks.
    if (i === index && window.matchMedia("(pointer: coarse)").matches) open();
    else select(i);
  };

  /* ---- Render ---- */

  const needle = results ? query.trim() : "";
  const host = bucketUrl ? new URL(bucketUrl).host : "bucket";
  const totalObjects = stats?.[""]?.objects ?? null;

  const folderCount = items.filter((e) => e.dir).length;
  const fileCount = items.length - folderCount;
  const folderBytes =
    stats?.[cwd]?.bytes ?? listing?.files.reduce((sum, [, size]) => sum + size, 0) ?? 0;

  const summary = results
    ? totalObjects !== null
      ? `${count(results.length)} of ${count(totalObjects)} objects match`
      : results.length >= 100
        ? "first 100 matches"
        : plural(results.length, "match")
    : listing
      ? [folderCount ? plural(folderCount, "folder") : null, plural(fileCount, "file"), formatBytes(folderBytes)]
          .filter(Boolean)
          .join(" · ")
      : "";

  const footPath = selected ? selected.key : cwd;
  const footSegments = footPath.split("/").filter(Boolean);

  return (
    <section ref={root} className="fb tile animate-rise col-span-12 [animation-delay:.06s]" aria-label="File browser" onKeyDown={onKeyDown}>
      <div className="fb-tb">
        <nav className="fb-crumbs" aria-label="Folder">
          {searchActive && query.trim().length >= SEARCH_MIN ? (
            <span className="res">
              Search results in the whole bucket for “<b>{query.trim()}</b>”
            </span>
          ) : (
            <>
              <button type="button" onClick={() => go("")} aria-current={cwd === "" ? "page" : undefined}>
                bucket
              </button>
              {crumbs(cwd).map((crumb, i, all) => (
                <span key={crumb.prefix} className="contents">
                  <span className="sep" aria-hidden="true">
                    /
                  </span>
                  <button
                    type="button"
                    onClick={() => go(crumb.prefix)}
                    aria-current={i === all.length - 1 ? "page" : undefined}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </>
          )}
          <span className="cnt">{summary}</span>
        </nav>

        <div className="fb-tools">
          <label className="fb-search">
            <span className="sr-only">Search files</span>
            <SearchIcon size={14} />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the whole bucket…"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="fb-k">/</kbd>
            {searching && <span className="busy">…</span>}
            {query && (
              <button
                type="button"
                className="x"
                aria-label="Clear search"
                onClick={() => {
                  clearSearch();
                  search.current?.focus();
                }}
              >
                <CloseIcon size={13} />
              </button>
            )}
          </label>

          <div className="fb-sort">
            <span aria-hidden="true">Sort</span>
            <fieldset className="fb-seg">
              <legend className="sr-only">Sort by</legend>
              {SORT_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sort === key}
                  onClick={() => {
                    if (sort === key) setReverse((r) => !r);
                    else {
                      setSort(key);
                      setReverse(false);
                    }
                  }}
                >
                  {key}
                </button>
              ))}
            </fieldset>
            <button
              type="button"
              className="fb-rev"
              aria-label="Reverse sort"
              aria-pressed={reverse}
              onClick={() => setReverse((r) => !r)}
            >
              <ArrowDownIcon size={12} />
            </button>
          </div>

          <fieldset className="fb-views">
            <legend className="sr-only">View</legend>
            <button type="button" aria-pressed={view === "list"} aria-label="List view" onClick={() => setView("list")}>
              <ListIcon size={15} />
            </button>
            <button type="button" aria-pressed={view === "grid"} aria-label="Grid view" onClick={() => setView("grid")}>
              <GridIcon size={15} />
            </button>
          </fieldset>
        </div>
      </div>

      <div className="fb-cols">
        <div ref={parentCol} className="fb-col fb-parent">
          <ParentColumn
            cwd={cwd}
            searching={searchActive}
            host={host}
            listings={listings}
            stats={stats}
            sort={sort}
            reverse={reverse}
            onGo={go}
          />
        </div>

        <div ref={curCol} className="fb-col fb-cur">
          <div className="fb-col-h">
            <b>{searchActive ? "results" : cwd ? `${baseName(cwd)}/` : `${host}/`}</b>
            <span>{items.length ? `${index + 1} / ${count(items.length)}` : searching ? "" : "empty"}</span>
          </div>

          {searchFailed ? (
            <p className="fb-empty">Couldn't search just now — try again.</p>
          ) : searching && !results ? (
            <SkeletonRows />
          ) : !results && rootError && cwd === "" ? (
            <p className="fb-empty">
              Couldn't reach the bucket.
              {import.meta.env.DEV && (
                <>
                  {" "}Check the <code className="font-mono text-ink-dim">BUCKET</code> binding in wrangler.jsonc.
                </>
              )}
            </p>
          ) : !results && !listing ? (
            failed.has(cwd) ? (
              <p className="fb-empty">
                <button type="button" className="fb-textbtn" onClick={() => void load(cwd)}>
                  Couldn't load this folder — retry
                </button>
              </p>
            ) : (
              <SkeletonRows />
            )
          ) : items.length === 0 ? (
            <p className="fb-empty">
              {results ? `Nothing matches “${query.trim()}”.` : cwd ? "This folder is empty." : "The bucket is empty."}
            </p>
          ) : (
            <>
              <div
                ref={list}
                role="listbox"
                tabIndex={0}
                aria-label={results ? "Search results" : `Contents of ${cwd || "the bucket"}`}
                aria-activedescendant={index >= 0 ? `fb-opt-${index}` : undefined}
                className={view === "grid" ? "fb-grid outline-none" : `fb-rows outline-none${results ? " no-dt" : ""}`}
              >
                {shown.map((entry, i) =>
                  view === "grid" ? (
                    // biome-ignore lint/a11y/useFocusableInteractive: the listbox holds focus and points here with aria-activedescendant
                    // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox around it owns the keyboard
                    <div
                      key={entry.key}
                      id={`fb-opt-${i}`}
                      role="option"
                      aria-selected={i === index}
                      className="fb-card"
                      onClick={() => onPick(i)}
                      onDoubleClick={open}
                    >
                      <CardThumb entry={entry} base={bucketUrl} />
                      <div className="meta">
                        <b title={entry.key}>
                          {entry.dir ? `${entry.name}/` : <Highlight text={entry.name} query={needle} />}
                        </b>
                        <span>
                          {entry.dir
                            ? entry.count !== null
                              ? plural(entry.count, "item")
                              : "folder"
                            : `${formatBytes(entry.size ?? 0)}${entry.uploaded ? ` · ${formatDay(entry.uploaded)}` : ""}`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <Row
                      key={entry.key}
                      id={`fb-opt-${i}`}
                      entry={entry}
                      selected={i === index}
                      query={needle}
                      showFolder={results !== null}
                      onClick={() => onPick(i)}
                      onDoubleClick={open}
                    />
                  ),
                )}
              </div>
              {items.length > shown.length && (
                <div className="fb-more">
                  <button type="button" className="fb-textbtn" onClick={() => setLimit(shown.length + WINDOW)}>
                    show {count(Math.min(WINDOW, items.length - shown.length))} more of{" "}
                    {count(items.length - shown.length)}
                  </button>
                </div>
              )}
              {!results && listing?.truncated && (
                <p className="fb-note">Showing the first 20,000 objects in this folder.</p>
              )}
            </>
          )}
        </div>

        <div className="fb-col fb-pv-col">
          <div className="fb-col-h">
            <b>preview</b>
            {selected && <span>{selected.dir ? "folder" : fileKind(selected.name)}</span>}
          </div>
          {selected && (
            <div className="fb-pv">
              <div className="fb-pv-head">
                <EntryIcon entry={selected} />
                <p title={selected.key}>{selected.dir ? `${selected.name}/` : selected.name}</p>
                {!selected.dir && (
                  <a
                    href={publicUrl(bucketUrl, selected.key)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="fb-icon-btn"
                    aria-label="Open in a new tab"
                    title="Open in a new tab"
                  >
                    <ExternalIcon size={14} />
                  </a>
                )}
                <button
                  type="button"
                  className={copied === selected.key ? "fb-icon-btn ok" : "fb-icon-btn"}
                  aria-label={copied === selected.key ? "Link copied" : "Copy link"}
                  title="Copy link (y)"
                  onClick={() => void copyLink(selected)}
                >
                  {copied === selected.key ? (
                    <CheckIcon size={14} />
                  ) : (
                    <LinkIcon size={14} />
                  )}
                </button>
              </div>
              {selected.dir ? (
                <FolderPreview
                  entry={selected}
                  listing={listings[selected.key]}
                  failed={failed.has(selected.key)}
                  stats={stats}
                  sort={sort}
                  reverse={reverse}
                  bucketUrl={bucketUrl}
                  onGo={go}
                />
              ) : (
                <FilePreview key={selected.key} entry={selected} bucketUrl={bucketUrl} playback={playback} />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="fb-foot">
        <span className="sp">
          <span>
            {host}/
            {footSegments.slice(0, -1).map((s) => `${s}/`).join("")}
            {footSegments.length > 0 && (
              <b>
                {footSegments[footSegments.length - 1]}
                {footPath.endsWith("/") ? "/" : ""}
              </b>
            )}
          </span>
          {items.length > 0 && (
            <span className="pos">
              {index + 1}/{count(items.length)}
            </span>
          )}
        </span>
        <span className="keys" aria-hidden="true">
          <span>
            <kbd className="fb-k">j</kbd>
            <kbd className="fb-k">k</kbd>
            <em>move</em>
          </span>
          <span>
            <kbd className="fb-k">h</kbd>
            <kbd className="fb-k">l</kbd>
            <em>out · in</em>
          </span>
          <span className="x1">
            <kbd className="fb-k">↵</kbd>
            <em>open · play</em>
          </span>
          <span className="x2">
            <kbd className="fb-k">/</kbd>
            <em>search</em>
          </span>
          <span className="x2">
            <kbd className="fb-k">y</kbd>
            <em>copy link</em>
          </span>
          <span className="x1">
            <kbd className="fb-k">s</kbd>
            <kbd className="fb-k">r</kbd>
            <em>sort</em>
          </span>
          <span className="x2">
            <kbd className="fb-k">v</kbd>
            <em>view</em>
          </span>
        </span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Highlight({ text, query }: { text: string; query: string }) {
  const range = query ? matchRange(text, query) : null;
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <mark>{text.slice(range[0], range[1])}</mark>
      {text.slice(range[1])}
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="px-4 py-2.5" aria-hidden="true">
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: a fixed-length skeleton */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="placeholder-block my-2.5 h-4 rounded-xs" />
      ))}
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: skeleton */}
    </div>
  );
}

function Row({
  entry,
  id,
  selected,
  on,
  query = "",
  showFolder = false,
  onClick,
  onDoubleClick,
}: {
  entry: Entry;
  id?: string;
  /** Set in the current column, where rows are listbox options. */
  selected?: boolean;
  /** Set in the parent column and folder previews, where rows are plain list items. */
  on?: boolean;
  query?: string;
  showFolder?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const option = selected !== undefined;
  const meta: ReactNode = entry.dir
    ? entry.count !== null
      ? plural(entry.count, "item")
      : ""
    : entry.uploaded
      ? formatDay(entry.uploaded)
      : "";
  const className = `fb-row${entry.dir ? " dir" : ""}${on ? " on" : ""}`;
  const body = (
    <>
      <EntryIcon entry={entry} />
      <span className="nm" title={entry.key}>
        {showFolder && entry.folder && (
          <span className="path">
            <Highlight text={entry.folder} query={query} />
          </span>
        )}
        {entry.dir ? `${entry.name}/` : <Highlight text={entry.name} query={query} />}
      </span>
      <span className="m dt">{meta}</span>
      <span className="m">{entry.size !== null ? formatBytes(entry.size) : ""}</span>
    </>
  );

  if (option) {
    return (
      // biome-ignore lint/a11y/useFocusableInteractive: the listbox holds focus and points here with aria-activedescendant
      // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox around it owns the keyboard
      <div id={id} role="option" aria-selected={selected} className={className} onClick={onClick} onDoubleClick={onDoubleClick}>
        {body}
      </div>
    );
  }
  // Parent column and folder previews: a pointer shortcut to what the
  // keyboard reaches with h and l.
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: h and l are the keyboard path
    <li className={className} onClick={onClick}>
      {body}
    </li>
  );
}

function ParentColumn({
  cwd,
  searching,
  host,
  listings,
  stats,
  sort,
  reverse,
  onGo,
}: {
  cwd: string;
  searching: boolean;
  host: string;
  listings: Record<string, R2Listing>;
  stats: ReturnType<typeof folderStats> | null;
  sort: SortKey;
  reverse: boolean;
  onGo: (prefix: string, focusKey?: string) => void;
}) {
  if (searching) {
    return (
      <>
        <div className="fb-col-h">
          <b>search</b>
          <span>bucket</span>
        </div>
        <p className="fb-note">
          Searching every key in the bucket, not just this folder.
          <br />
          <br />
          <kbd className="fb-k">esc</kbd> to go back.
        </p>
      </>
    );
  }

  if (cwd === "") {
    return (
      <>
        <div className="fb-col-h">
          <b>r2://</b>
        </div>
        <ul className="fb-rows">
          <Row entry={{ dir: true, name: host, key: "", folder: "", size: null, uploaded: null, count: null }} on onClick={() => onGo("")} />
        </ul>
      </>
    );
  }

  const parent = parentOf(cwd);
  const listing = listings[parent];
  const entries = listing ? sortEntries(listingEntries(parent, listing, stats), sort, reverse) : [];
  return (
    <>
      <div className="fb-col-h">
        <b>{parent ? `${baseName(parent)}/` : `${host}/`}</b>
      </div>
      {listing ? (
        <ul className="fb-rows">
          {entries.map((entry) => (
            <Row
              key={entry.key}
              entry={entry}
              on={entry.key === cwd}
              onClick={() => (entry.dir ? onGo(entry.key) : onGo(parent, entry.key))}
            />
          ))}
        </ul>
      ) : (
        <SkeletonRows />
      )}
    </>
  );
}

function FolderPreview({
  entry,
  listing,
  failed,
  stats,
  sort,
  reverse,
  bucketUrl,
  onGo,
}: {
  entry: Entry;
  listing: R2Listing | undefined;
  failed: boolean;
  stats: ReturnType<typeof folderStats> | null;
  sort: SortKey;
  reverse: boolean;
  bucketUrl: string;
  onGo: (prefix: string, focusKey?: string) => void;
}) {
  const children = listing ? sortEntries(listingEntries(entry.key, listing, stats), sort, reverse) : null;
  const rows: [string, string][] = [];
  if (entry.count !== null) rows.push(["Objects", count(entry.count)]);
  else if (listing) rows.push(["Here", `${plural(listing.folders.length, "folder")}, ${plural(listing.files.length, "file")}`]);
  if (entry.size !== null) rows.push(["Size", formatBytes(entry.size)]);
  if (entry.uploaded) rows.push(["Updated", formatDay(entry.uploaded)]);
  const hasMedia = listing?.files.some(([name]) => previewKind(name) !== null) ?? false;

  return (
    <>
      {children === null ? (
        failed ? (
          <p className="fb-note">Couldn't list this folder.</p>
        ) : (
          <SkeletonRows />
        )
      ) : children.length === 0 ? (
        <p className="fb-note">This folder is empty.</p>
      ) : (
        <>
          <ul className="fb-rows">
            {children.slice(0, FOLDER_PEEK).map((child) => (
              <Row key={child.key} entry={child} onClick={() => onGo(entry.key, child.key)} />
            ))}
          </ul>
          {children.length > FOLDER_PEEK && <p className="more-k">and {count(children.length - FOLDER_PEEK)} more</p>}
        </>
      )}
      {rows.length > 0 && <DetailList rows={rows} />}
      {bucketUrl && hasMedia && <Backfill folder={entry.key} base={bucketUrl} />}
    </>
  );
}

function FilePreview({
  entry,
  bucketUrl,
  playback,
}: {
  entry: Entry;
  bucketUrl: string;
  playback: React.RefObject<(() => void) | null>;
}) {
  const media = previewKind(entry.name);
  if (media) {
    return (
      <MediaPreview
        fileKey={entry.key}
        kind={media}
        size={entry.size ?? 0}
        bucketBase={bucketUrl}
        control={playback}
      />
    );
  }
  if (fileKind(entry.name) === "image") return <ImagePreview entry={entry} base={bucketUrl} />;
  if (isTextPreviewable(entry.name)) return <TextPreview entry={entry} base={bucketUrl} />;
  return (
    <>
      <Fallback
        url={publicUrl(bucketUrl, entry.key)}
        name={entry.name}
        size={entry.size ?? 0}
        uploaded={entry.uploaded ?? undefined}
        message="No preview for this format."
      />
      <DetailList rows={[["Key", entry.key]]} />
    </>
  );
}
