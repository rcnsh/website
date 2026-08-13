import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { iconFor } from "./icon-map";
import { cn } from "@/lib/utils";

/**
 * Entries come from src/content/site.json via TopBar rather than being
 * imported here — site.ts pulls in Zod for validation, and this is a client
 * island, so importing it would ship the validator to the browser.
 */
export type PaletteItem = {
  href: string;
  label: string;
  icon?: string;
  keywords?: string;
};

type Item = PaletteItem & { id: string; external: boolean };

/** Subsequence match — "gst" finds "Guestbook". Returns null when no match. */
function score(item: Item, query: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const haystack = `${item.label} ${item.keywords ?? ""}`.toLowerCase();

  const direct = item.label.toLowerCase().indexOf(q);
  if (direct === 0) return 1000;
  if (direct > 0) return 800 - direct;
  if (haystack.includes(q)) return 500;

  let cursor = 0;
  let gaps = 0;
  for (const char of q) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return 200 - Math.min(gaps, 199);
}

export default function CommandPalette({ items }: { items: PaletteItem[] }) {
  const entries = useMemo<Item[]>(
    () =>
      items.map((item) => ({
        ...item,
        id: item.href,
        external: /^https?:/.test(item.href) || item.href.endsWith(".txt"),
      })),
    [items],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const results = useMemo(() => {
    return entries.map((item) => ({ item, s: score(item, query) }))
      .filter((r): r is { item: Item; s: number } => r.s !== null)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.item);
  }, [entries, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (item: Item) => {
      close();
      if (item.external) {
        window.open(item.href, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = item.href;
      }
    },
    [close],
  );

  // Global ⌘K / Ctrl+K, and "/" as a shortcut when not already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);

      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Lock scroll and focus the input while open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
      cancelAnimationFrame(id);
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view when navigating with arrows.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) go(item);
    }
  };

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open command palette"
      className="flex items-center gap-2 font-mono text-xs text-ink-faint transition-colors hover:text-ink-dim"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">⌘K</span>
    </button>
  );

  const overlay = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div
            className="absolute inset-0 bg-black/75"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="card relative w-full max-w-md"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Jump to…"
                aria-label="Search pages and links"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
              <kbd className="shrink-0 font-mono text-[10px] text-ink-faint">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
              {results.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-faint">
                  Nothing matches “{query}”.
                </p>
              ) : (
                results.map((item, i) => {
                  const Icon = iconFor(item.icon);
                  return (
                    <button
                      key={item.id}
                      data-index={i}
                      type="button"
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                        i === active
                          ? "bg-raised text-ink"
                          : "text-ink-dim hover:text-ink",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          i === active ? "text-brand" : "text-ink-faint",
                        )}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.external && (
                        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                          ↗
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {trigger}
      {mounted && createPortal(overlay, document.body)}
    </>
  );
}
