import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";
import { cn, relativeTime } from "@/lib/utils";

/**
 * The signature list, loaded a page at a time as the reader scrolls. A
 * server-rendered island, so the first page is in the document before React
 * runs — the no-JavaScript fallback is a short guestbook, not an empty one.
 */

type Props = {
  /** The first page, rendered on the server. */
  initial: GuestbookEntry[];
  /** Cursor for the page after `initial`, or null if that was all of them. */
  initialCursor: string | null;
  /** The signed-in reader, so their own entries get a delete control. */
  sessionGithubId: number | null;
};

type Page = { entries: GuestbookEntry[]; next: string | null; error?: boolean };

export default function GuestbookList({
  initial,
  initialCursor,
  sessionGithubId,
}: Props) {
  const [entries, setEntries] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const sentinel = useRef<HTMLDivElement | null>(null);

  // In refs as well as state: the observer callback is not re-created per
  // render, and one closed over the first cursor would refetch page two forever.
  const cursorRef = useRef(initialCursor);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    const after = cursorRef.current;
    if (!after || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const response = await fetch(
        `/api/guestbook/list?after=${encodeURIComponent(after)}`,
      );
      const page = (await response.json()) as Page;

      if (page.error || !Array.isArray(page.entries)) {
        setFailed(true);
        return;
      }

      // The cursor cannot overlap, but a delete between two fetches shifts the
      // window, so filter for rows already on screen.
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });

      cursorRef.current = page.next;
      setCursor(page.next);
    } catch {
      // Offline or cut short. The sentinel stays put, so scrolling retries.
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // `cursor` is load-bearing: an observer reports transitions, not states, and
  // on a tall screen the sentinel stays inside the margin after a page lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;

    // A margin, so the next page lands before the reader reaches the bottom.
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, cursor]);

  if (entries.length === 0) {
    return (
      <p className="py-2 text-sm text-ink-faint">
        No one's signed yet. Be the first.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
        {entries.map((entry) => {
          const posted = new Date(entry.createdAt * 1000);
          const mine =
            sessionGithubId !== null && sessionGithubId === entry.githubId;

          return (
            <li
              key={entry.id}
              className={cn(
                "flex flex-col rounded-card border bg-[color-mix(in_oklab,var(--color-base)_50%,var(--color-surface))] px-4 pt-4 pb-3.5 transition-colors hover:border-line",
                mine
                  ? "border-[color-mix(in_oklab,var(--color-brand)_45%,var(--color-line-soft))]"
                  : "border-line-soft",
              )}
            >
              <p className="break-words text-[0.9375rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
                {entry.message}
              </p>

              <div className="mt-auto flex min-w-0 items-center gap-2 pt-3.5 font-mono text-[11px] text-ink-faint">
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    className="h-5 w-5 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full bg-raised" />
                )}
                <a
                  href={`https://github.com/${entry.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate transition-colors hover:text-ink-dim"
                >
                  @{entry.username}
                </a>
                <span aria-hidden="true">·</span>
                <time dateTime={posted.toISOString()} className="shrink-0">
                  {relativeTime(posted)}
                </time>
                {mine && (
                  <form
                    method="POST"
                    action="/api/guestbook/delete"
                    className="ml-auto shrink-0"
                  >
                    <input type="hidden" name="id" value={entry.id} />
                    <button
                      type="submit"
                      className="text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-bad hover:decoration-bad"
                    >
                      delete
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {cursor && (
        /* A real button, not a bare sentinel, so it stays reachable from the
           keyboard when the observer does not fire. */
        <div ref={sentinel} className="pt-4 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-live="polite"
            className="-my-2 py-2 font-mono text-xs text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink-dim hover:decoration-brand disabled:no-underline"
          >
            {loading
              ? "loading…"
              : failed
                ? "couldn't load more — retry"
                : "load more"}
          </button>
        </div>
      )}
    </>
  );
}
