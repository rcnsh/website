import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";
import { relativeTime } from "@/lib/utils";

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
      <p className="py-6 text-sm text-ink-faint">
        No one's signed yet. Be the first.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {entries.map((entry) => {
          const posted = new Date(entry.createdAt * 1000);

          return (
            <li key={entry.id} className="flex gap-3.5 py-4">
              {entry.avatarUrl ? (
                <img
                  src={entry.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                />
              ) : (
                <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-raised" />
              )}

              <div className="min-w-0 flex-1">
                <p className="break-words text-[0.9375rem] leading-relaxed text-ink">
                  {entry.message}
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
                  <a
                    href={`https://github.com/${entry.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-ink-dim"
                  >
                    @{entry.username}
                  </a>
                  {" · "}
                  <time dateTime={posted.toISOString()}>
                    {relativeTime(posted)}
                  </time>
                  {sessionGithubId !== null &&
                    sessionGithubId === entry.githubId && (
                      <>
                        {" · "}
                        <form
                          method="POST"
                          action="/api/guestbook/delete"
                          className="inline"
                        >
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-red-400/90"
                          >
                            delete
                          </button>
                        </form>
                      </>
                    )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {cursor && (
        /* A real button, not a bare sentinel, so it stays reachable from the
           keyboard when the observer does not fire. */
        <div ref={sentinel} className="pt-5 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-live="polite"
            className="font-mono text-xs text-ink-faint underline decoration-line-strong underline-offset-[4px] transition-colors hover:text-ink-dim hover:decoration-brand disabled:no-underline"
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
