import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronRight,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Link2,
  Search,
  X,
} from "lucide-react";
import type { R2File, R2Listing, R2Tree } from "@/lib/r2";
import { cn, fileKind, formatBytes, formatDate } from "@/lib/utils";

const ICONS = {
  image: { Icon: FileImage, colour: "text-emerald-500/70" },
  video: { Icon: FileVideo, colour: "text-purple-400/70" },
  audio: { Icon: FileAudio, colour: "text-pink-400/70" },
  archive: { Icon: FileArchive, colour: "text-amber-500/70" },
  doc: { Icon: FileText, colour: "text-red-400/70" },
  code: { Icon: FileCode, colour: "text-brand" },
  text: { Icon: FileText, colour: "text-ink-faint" },
  file: { Icon: File, colour: "text-ink-faint" },
} as const;

/**
 * The bucket's public origin. Constant for the life of the page and wanted by
 * every row, so it rides a context rather than a sixth drilled prop.
 */
const BucketBase = createContext("");

/**
 * The public URL for a key. Built here rather than sent down with every file,
 * because at a few hundred files these strings were most of the tree's weight.
 * Mirrors /api/files/download, which serves the same objects when the bucket
 * has no public domain of its own.
 */
function urlFor(base: string, key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return base
    ? `${base}/${encoded}`
    : `/api/files/download?key=${encodeURIComponent(key)}`;
}

type Props = {
  /** Whole bucket, keyed by prefix. Null once the bucket is too big to inline. */
  tree: R2Tree | null;
  initial: R2Listing | null;
  bucketUrl: string;
};

export default function FileBrowser({ tree, initial, bucketUrl }: Props) {
  // With a tree, every directory is already here and nothing is ever fetched.
  const complete = tree !== null;
  const [listings, setListings] = useState<Record<string, R2Listing>>(
    () => tree ?? (initial ? { "": initial } : {}),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Folders whose children have ever been rendered. See `toggle`. */
  const [mounted, setMounted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [rootError, setRootError] = useState(!tree && !initial);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<R2File[] | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(
    async (prefix: string) => {
      if (complete || listings[prefix]) return;
      setLoading((prev) => new Set(prev).add(prefix));
      try {
        const response = await fetch(
          `/api/files/list?prefix=${encodeURIComponent(prefix)}`,
        );
        const data = (await response.json()) as R2Listing;
        setListings((prev) => ({ ...prev, [prefix]: data }));
        if (prefix === "") setRootError(false);
      } catch {
        if (prefix === "") setRootError(true);
      } finally {
        setLoading((prev) => {
          const next = new Set(prev);
          next.delete(prefix);
          return next;
        });
      }
    },
    [complete, listings],
  );

  // One-shot bootstrap: listing `load` here would refetch the root every time
  // a listing lands and changes the callback's identity.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount only
  useEffect(() => {
    if (!complete && !initial) void load("");
  }, []);

  const toggle = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) {
        next.delete(prefix);
      } else {
        next.add(prefix);
        void load(prefix);
        // Grows only — the collapse animation needs children to stay in the DOM
        // once opened.
        setMounted((m) => (m.has(prefix) ? m : new Set(m).add(prefix)));
      }
      return next;
    });
  };

  // Flat index of every file, re-keyed by full path so a match can be shown
  // with its folder. Only meaningful when the whole tree is present.
  const allFiles = useMemo(
    () =>
      complete
        ? Object.entries(listings).flatMap(([prefix, listing]) =>
            listing.files.map(
              ([path, size, uploaded]): R2File => [prefix + path, size, uploaded],
            ),
          )
        : [],
    [complete, listings],
  );

  // Local and instant with a complete tree, otherwise debounced against
  // /api/files/search.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }

    if (complete) {
      const needle = term.toLowerCase();
      setResults(
        allFiles
          .filter(([key]) => key.toLowerCase().includes(needle))
          .slice(0, 100),
      );
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/files/search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as { files: R2File[] };
        setResults(data.files ?? []);
      } catch {
        // Aborted or failed — keep the previous results.
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, complete, allFiles]);

  const root = listings[""];

  return (
    <BucketBase value={bucketUrl}>
      <div>
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the whole bucket…"
            aria-label="Search files"
            className="w-full border-b border-line bg-transparent py-2.5 pl-6 pr-6 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand [&::-webkit-search-cancel-button]:hidden"
          />
          {searching && (
            <span className="absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-faint">
              …
            </span>
          )}
          {!searching && query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="border-b border-line">
          {results !== null ? (
            <SearchResults results={results} query={query} />
          ) : rootError ? (
            <p className="py-8 text-sm text-ink-faint">
              Couldn't reach the bucket. Check the{" "}
              <code className="font-mono text-ink-dim">BUCKET</code> binding in
              wrangler.jsonc.
            </p>
          ) : !root ? (
            <div className="py-2">
              {/* biome-ignore-start lint/suspicious/noArrayIndexKey: a fixed-length
                skeleton — the rows are identical and never reorder. */}
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="placeholder-block my-1.5 h-4 rounded-xs" />
              ))}
              {/* biome-ignore-end lint/suspicious/noArrayIndexKey: skeleton */}
            </div>
          ) : root.folders.length === 0 && root.files.length === 0 ? (
            <p className="py-8 text-sm text-ink-faint">The bucket is empty.</p>
          ) : (
            <div className="py-1">
              <Level
                prefix=""
                depth={0}
                listings={listings}
                expanded={expanded}
                mounted={mounted}
                loading={loading}
                onToggle={toggle}
              />
            </div>
          )}
        </div>

        {root?.truncated && (
          <p className="mt-3 font-mono text-[11px] text-ink-faint">
            Showing the first 20,000 objects in this folder.
          </p>
        )}
      </div>
    </BucketBase>
  );
}

/* -------------------------------------------------------------------------- */

type LevelProps = {
  prefix: string;
  depth: number;
  listings: Record<string, R2Listing>;
  expanded: Set<string>;
  /** Folders whose children have been rendered at least once. */
  mounted: Set<string>;
  loading: Set<string>;
  onToggle: (prefix: string) => void;
};

function Level({
  prefix,
  depth,
  listings,
  expanded,
  mounted,
  loading,
  onToggle,
}: LevelProps) {
  const listing = listings[prefix];
  if (!listing) return null;

  return (
    <>
      {listing.folders.map((name) => {
        const childPrefix = `${prefix}${name}/`;
        return (
          <FolderRow
            key={childPrefix}
            name={name}
            prefix={childPrefix}
            depth={depth}
            isOpen={expanded.has(childPrefix)}
            isLoading={loading.has(childPrefix)}
            listings={listings}
            expanded={expanded}
            mounted={mounted}
            loading={loading}
            onToggle={onToggle}
          />
        );
      })}
      {listing.files.map((file) => (
        <FileRow key={file[0]} file={file} parent={prefix} depth={depth} />
      ))}
    </>
  );
}

function FolderRow({
  name,
  prefix,
  depth,
  isOpen,
  isLoading,
  listings,
  expanded,
  mounted,
  loading,
  onToggle,
}: {
  name: string;
  prefix: string;
  depth: number;
  isOpen: boolean;
  isLoading: boolean;
} & Omit<LevelProps, "prefix" | "depth">) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(prefix)}
        aria-expanded={isOpen}
        className="group flex w-full items-center gap-2 py-1 text-left"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        <span
          className={cn(
            "shrink-0 text-ink-faint transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            isOpen && "rotate-90",
          )}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </span>

        {isOpen ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-brand" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-brand/60" />
        )}

        <span className="truncate font-mono text-[0.8125rem] text-ink-dim transition-colors group-hover:text-ink">
          {name}
        </span>

        {isLoading && (
          <span className="shrink-0 font-mono text-[10px] text-ink-faint">…</span>
        )}
      </button>

      {/*
        A CSS grid-row transition, not an animated height: `1fr` needs no
        measurement, so it nests cleanly and can't get stuck at 0 if the frame
        loop is starved in a background tab.
      */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        {/* `inert` keeps collapsed rows out of the tab order and the a11y tree. */}
        <div className="min-h-0 overflow-hidden" inert={!isOpen}>
          <div
            className="border-l border-line"
            style={{ marginLeft: `${depth * 16 + 7}px` }}
          >
            <div style={{ marginLeft: `-${depth * 16 + 7}px` }}>
              {/*
                Gated on first open. The whole tree is inlined, so without this
                React would mount every file row on first paint and reconcile
                them all on every keystroke.
              */}
              {mounted.has(prefix) && (
                <Level
                  prefix={prefix}
                  depth={depth + 1}
                  listings={listings}
                  expanded={expanded}
                  mounted={mounted}
                  loading={loading}
                  onToggle={onToggle}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileRow({
  file,
  parent,
  depth,
}: {
  file: R2File;
  /** Prefix of the listing this row came from, which makes up the rest of its key. */
  parent: string;
  depth: number;
}) {
  const [name, size, uploaded] = file;
  const base = useContext(BucketBase);
  const key = parent + name;
  const { Icon, colour } = ICONS[fileKind(name)];

  return (
    <div
      className="group flex items-center gap-2 py-1"
      style={{ paddingLeft: `${depth * 16}px` }}
    >
      <span className="w-3.5 shrink-0" />
      <Icon className={cn("h-4 w-4 shrink-0", colour)} />

      <a
        href={urlFor(base, key)}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink-dim transition-colors hover:text-brand"
        title={key}
      >
        {name}
      </a>

      <CopyLink url={urlFor(base, key)} />

      <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint sm:block">
        {formatDate(new Date(uploaded * 1000))}
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
        {formatBytes(size)}
      </span>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.href).href);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — the link itself still works.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy link"
      className="shrink-0 p-1 text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
    </button>
  );
}

function SearchResults({ results, query }: { results: R2File[]; query: string }) {
  const base = useContext(BucketBase);

  if (results.length === 0) {
    return (
      <p className="py-8 text-sm text-ink-faint">Nothing matches “{query}”.</p>
    );
  }

  return (
    <div className="py-1">
      <p className="py-1.5 font-mono text-[11px] text-ink-faint">
        {results.length} match{results.length === 1 ? "" : "es"}
      </p>
      {/* Results span the bucket, so a path here is a whole key. */}
      {results.map(([key, size]) => {
        const name = key.split("/").pop() ?? key;
        const folder = key.slice(0, key.length - name.length);
        const { Icon, colour } = ICONS[fileKind(name)];
        const url = urlFor(base, key);

        return (
          <div key={key} className="group flex items-center gap-2 py-1">
            <Icon className={cn("h-4 w-4 shrink-0", colour)} />
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] transition-colors hover:text-brand"
              title={key}
            >
              {folder && <span className="text-ink-faint">{folder}</span>}
              <span className="text-ink-dim">{name}</span>
            </a>
            <CopyLink url={url} />
            <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
              {formatBytes(size)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
